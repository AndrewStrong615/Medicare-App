"""
Client for the NPPES NPI Registry - the provider directory behind the
"find a doctor near me" screen.

NPPES (National Plan and Provider Enumeration System) is published by CMS and
is the authoritative US registry of enumerated healthcare providers. It is a
free public API, no key and no registration:

    https://npiregistry.cms.hhs.gov/api/?version=2.1&postal_code=...

Why this source, and what it is not
-----------------------------------
It is a *directory*, not a booking system. NPPES knows who providers are,
where they practise and what they are enumerated to do. It knows nothing about
appointment availability, and there is no slot or calendar data to be had here
at any price. Anything in this app that looked like "next available: Thursday
2pm" would therefore have to be invented, so nothing in this app says it.

What is transmitted, and why that is acceptable
-----------------------------------------------
Unlike the MedlinePlus call (see CLAUDE.md), this request carries **no health
information about the user**. It sends a postal code and a care-setting
category drawn from the fixed list below. It never sends the user's symptom
description, their intake tier, or their identity - there is no field on this
call that could hold one.

The care-setting categories are deliberately *settings* ("Urgent Care",
"Emergency Medicine") rather than conditions. A category like "Oncology" in a
query log would say something about the person asking; "Urgent Care" does not.
Callers may not pass an arbitrary taxonomy string, which is what
`CARE_SETTINGS` enforces.

Because no PHI is transmitted, CMS does not need to be a business associate
for this call path - which is what makes it usable today, when no vendor in
this project has signed a BAA.
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx

NPPES_ENDPOINT = "https://npiregistry.cms.hhs.gov/api/"
NPPES_VERSION = "2.1"
SOURCE_NAME = "NPPES NPI Registry, US Centers for Medicare & Medicaid Services"
REQUEST_TIMEOUT_SECONDS = 10.0

# Largest response we will read into memory. A capped directory search returns
# tens of KB; the limit is here so a hostile or broken endpoint - or anything
# between us and it - cannot exhaust this process by streaming without end.
MAX_RESPONSE_BYTES = 4 * 1024 * 1024

# Care settings the UI may search. Keys are what the client sends; values are
# the NPPES `taxonomy_description` filter. Settings only - see the module note
# on why this is not an open string.
CARE_SETTINGS: dict[str, str] = {
    "urgent_care": "Urgent Care",
    "family_medicine": "Family Medicine",
    "internal_medicine": "Internal Medicine",
    "pediatrics": "Pediatrics",
    "emergency": "Emergency Medicine",
    "general_practice": "General Practice",
    # A hospital is a setting, not a condition, so it belongs here. NPPES
    # enumerates them under this taxonomy; "Hospital" on its own matches far
    # less, and the specialised ones (Critical Access, Rehabilitation,
    # Psychiatric) return nothing in most ZIPs.
    #
    # Note NPPES also enumerates *individuals* under a hospital taxonomy, so a
    # result can be a clinician who practises at one rather than the building.
    # That is the source's own classification and is left as it is: relabelling
    # or filtering it would be MedHelp asserting something about the provider
    # that the directory does not say.
    "hospital": "General Acute Care Hospital",
}

DEFAULT_CARE_SETTING = "urgent_care"

# NPPES caps `limit` at 200; this app asks for far less.
MAX_RESULTS = 50

# Below this many hits the search widens to the 3-digit ZIP prefix.
WIDEN_BELOW = 5


class ProviderDirectoryUnavailable(Exception):
    """Raised when NPPES cannot be reached or its response cannot be read."""


@dataclass(frozen=True)
class Provider:
    npi: str
    name: str
    specialty: str | None
    phone: str | None
    address_line: str | None
    city: str | None
    state: str | None
    postal_code: str | None
    source_name: str = SOURCE_NAME

    @property
    def full_address(self) -> str | None:
        parts = [self.address_line, self.city, self.state, self.postal_code]
        present = [part for part in parts if part]
        return ", ".join(present) if present else None


def _clean_postal_code(raw: str) -> str:
    """
    Reduce whatever the client sent to the 5 digits NPPES matches on.

    NPPES stores 9-digit ZIP+4 values and prefix-matches, so sending the first
    five is both sufficient and the least specific thing that still works - a
    ZIP+4 identifies roughly a city block, which is more precision than a
    provider search needs and more than belongs in a third party's logs.
    """
    digits = "".join(character for character in raw if character.isdigit())
    return digits[:5]


def _format_phone(raw: str | None) -> str | None:
    if not raw:
        return None
    digits = "".join(character for character in raw if character.isdigit())
    if len(digits) == 10:
        return f"({digits[0:3]}) {digits[3:6]}-{digits[6:]}"
    return raw.strip() or None


def _title_case(raw: str | None) -> str | None:
    """
    NPPES stores names in upper case. Rendering "CITY MEDICAL OF UPPER EAST
    SIDE, PLLC" as-is reads as shouting, so it is cased for display only - the
    NPI, not the string, is the identifier.
    """
    if not raw:
        return None
    cleaned = " ".join(raw.split())
    return cleaned.title() if cleaned.isupper() else cleaned


def _parse_provider(record: dict) -> Provider | None:
    npi = str(record.get("number") or "").strip()
    if not npi:
        return None

    basic = record.get("basic") or {}
    organization = basic.get("organization_name")
    if organization:
        name = _title_case(organization)
    else:
        first = basic.get("first_name") or ""
        last = basic.get("last_name") or ""
        credential = (basic.get("credential") or "").strip()
        name = _title_case(f"{first} {last}".strip())
        if name and credential:
            name = f"{name}, {credential}"

    if not name:
        return None

    # `address_purpose == "LOCATION"` is the practice address; "MAILING" can
    # be a billing office in another state, which would be the wrong thing to
    # show under a "near you" heading.
    addresses = record.get("addresses") or []
    location = next(
        (item for item in addresses if item.get("address_purpose") == "LOCATION"),
        addresses[0] if addresses else {},
    )

    taxonomies = record.get("taxonomies") or []
    primary = next(
        (item for item in taxonomies if item.get("primary")),
        taxonomies[0] if taxonomies else {},
    )

    postal = (location.get("postal_code") or "").strip()

    return Provider(
        npi=npi,
        name=name,
        specialty=primary.get("desc"),
        phone=_format_phone(location.get("telephone_number")),
        address_line=_title_case(location.get("address_1")),
        city=_title_case(location.get("city")),
        state=(location.get("state") or "").strip() or None,
        postal_code=postal[:5] or None,
    )


def _query(params: dict, client: httpx.Client) -> list[dict]:
    try:
        response = client.get(NPPES_ENDPOINT, params=params)
        response.raise_for_status()
        if len(response.content) > MAX_RESPONSE_BYTES:
            raise ProviderDirectoryUnavailable(
                "The provider directory returned an unreadable response."
            )
        payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise ProviderDirectoryUnavailable(str(exc)) from exc

    if not isinstance(payload, dict):
        raise ProviderDirectoryUnavailable("Unexpected response shape from NPPES.")

    # NPPES reports its own errors inside a 200 body.
    if payload.get("Errors"):
        raise ProviderDirectoryUnavailable("NPPES rejected the search.")

    results = payload.get("results")
    return results if isinstance(results, list) else []


def _providers_in_area(
    base: dict, postal_code: str, prefix: str, client: httpx.Client
) -> list[Provider]:
    """
    Run one NPPES query and keep only the providers actually practising here.

    NPPES matches `postal_code` against *every* address on a record, including
    the secondary practice locations a telehealth clinician may register in
    dozens of states at once. `address_purpose=LOCATION` does not narrow that:
    a search for Hartford's 06103 returns doctors whose primary practice
    address is Katy, Texas, purely because Hartford is one entry in a national
    list. Since the app displays the primary practice address, printing those
    under "near you" would be false, so they are dropped here.

    Dropping them *before* the caller counts what it has is the point of this
    function. Counting the raw records instead let a search that had found
    almost nothing in the area look well-stocked, and skip the widening that
    would have found the rest.
    """
    found: list[Provider] = []
    for record in _query({**base, "postal_code": postal_code}, client):
        parsed = _parse_provider(record)
        if parsed is None:
            continue
        if not parsed.postal_code or not parsed.postal_code.startswith(prefix):
            continue
        found.append(parsed)
    return found


def search_providers(
    postal_code: str,
    care_setting: str = DEFAULT_CARE_SETTING,
    limit: int = 20,
    *,
    client: httpx.Client | None = None,
) -> list[Provider]:
    """
    Find providers of `care_setting` near `postal_code`.

    "Near" is approximate, and honestly so. NPPES has no coordinates and no
    radius search, so this matches on the ZIP itself and then, if that returns
    little, broadens to the 3-digit ZIP prefix - the same widen-until-something
    -matches shape as `search_terms.py`. A 3-digit prefix is a sectional centre
    facility, roughly a metro area.

    Distances are not computed here because there is nothing to compute them
    from. The mobile client works them out from the device's own location
    where it can, and shows none where it cannot, rather than displaying a
    made-up number.
    """
    zip5 = _clean_postal_code(postal_code)
    if len(zip5) != 5:
        raise ValueError("Enter a 5-digit ZIP code.")

    taxonomy = CARE_SETTINGS.get(care_setting)
    if taxonomy is None:
        raise ValueError("Unknown care setting.")

    capped = max(1, min(limit, MAX_RESULTS))
    base = {
        "version": NPPES_VERSION,
        "taxonomy_description": taxonomy,
        # Match on the practice address, not the mailing one. Without this a
        # search for 10001 returns a clinic whose *billing office* is in
        # Manhattan while it actually practises in Lake Mary, Florida - which
        # is what the app would then print under "near you".
        "address_purpose": "LOCATION",
        "limit": capped,
    }

    prefix = zip5[:3]

    owns_client = client is None
    client = client or httpx.Client(timeout=REQUEST_TIMEOUT_SECONDS)
    try:
        providers = _providers_in_area(base, zip5, prefix, client)

        # Widen to the sectional centre only when the exact ZIP is thin. A
        # dense urban ZIP usually fills the list on its own, and the wider
        # search returns providers materially further away.
        #
        # The count that decides this is of providers who survived the in-area
        # filter, never of raw NPPES records. Those are not the same number,
        # and treating them as one was a real bug: a search for downtown
        # Hartford came back with eight records, six of them doctors practising
        # in other states who merely list a Hartford location, so the widening
        # was skipped as unnecessary and the user was shown two providers out
        # of the twenty nearby. Where every record is out-of-area, the same
        # path showed none at all.
        if len(providers) < WIDEN_BELOW:
            seen = {provider.npi for provider in providers}
            providers.extend(
                provider
                for provider in _providers_in_area(base, prefix + "*", prefix, client)
                if provider.npi not in seen
            )
    finally:
        if owns_client:
            client.close()

    return providers[:capped]
