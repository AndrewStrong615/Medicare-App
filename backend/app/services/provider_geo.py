"""
How far each provider is from the ZIP the user searched.

Sits between `provider_directory` (who the providers are), `address_geocoder`
(where their addresses are) and `zip_geography` (where a ZIP is), and is the
only place that decides what number the screen gets.

## The problem this solves

Distances used to be measured centroid to centroid, which has **no resolution
below one ZIP code**. Since `search_providers` queries NPPES by the exact ZIP
first, most results sit *in* the searched ZIP, and a ZIP's centroid is zero
miles from itself. A real search of Las Vegas 89109 returned five of six
providers at "~0.0 mi", for clinics up to three miles apart and up to three
miles from the user. The number was not merely imprecise; it was the same
number for everyone, so it could not be used to choose between them.

Geocoding the provider's street address replaces one half of that measurement
with a real point. The same search now returns 0.4, 1.6, 1.9, 2.5 and 2.9
miles.

## What is still approximate, and why the "~" stays

**The user's half is still a ZIP centroid.** They typed a ZIP, or their
coordinate was reduced to one, so the app knows where they are only to
ZIP-code resolution - and it is deliberately not told anything finer, because
a user's precise location is data this app has chosen not to collect for this
purpose. The provider end is now exact; the user end is the centre of their
ZIP.

So the honest reading of "~2.5 mi" is "about two and a half miles from the
middle of your ZIP code". In a dense urban ZIP that is close to the truth. In
a large rural one the user's own half can be off by miles. It is also a
straight line, never a driving distance. The UI keeps the "~" for all of this,
and `ProviderSearchScreen` keeps its note saying the app cannot promise a
route.

## Failure never costs results

The providers are already in hand by the time this runs. A geocoder outage,
an unplaceable address or an unknown ZIP downgrades to the centroid estimate,
and where even that is meaningless the answer is None - which the client
already renders as no distance at all, rather than as a zero.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.provider_location import ProviderLocation
from app.services.address_geocoder import (
    AddressToGeocode,
    GeocoderUnavailable,
    geocode_addresses,
)
from app.services.provider_directory import Provider
from app.services.zip_geography import centroid, distance_miles, haversine_miles

logger = logging.getLogger(__name__)

# How long a "could not place this address" answer stands before the geocoder
# is asked again. Long enough that a bad address is not re-sent on every
# search; short enough that a correction in the registry is eventually picked
# up.
NEGATIVE_RETRY_DAYS = 30


def _address_signature(provider: Provider) -> str:
    """
    The address as it was asked about, so a provider that moves is re-placed.

    Without this a clinic that changed premises would keep the coordinate of
    its old address for as long as the cache row survived - and the row has no
    natural expiry, because a correct address never needs one.
    """
    parts = [
        provider.address_line,
        provider.city,
        provider.state,
        provider.postal_code,
    ]
    return ", ".join(part.strip() for part in parts if part and part.strip())[:500]


def _is_fresh(row: ProviderLocation, signature: str) -> bool:
    """Whether a cached row can answer for this address without re-asking."""
    if row.geocoded_address != signature:
        # The provider's registered address has changed since we asked.
        return False

    if row.has_coordinates():
        # A placed address does not go stale: the coordinate of a street
        # address is a fact, and a move is caught by the signature above.
        return True

    checked = row.checked_at
    if checked is None:
        return False
    if checked.tzinfo is None:
        # SQLite hands back naive datetimes even for a timezone-aware column.
        checked = checked.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - checked < timedelta(days=NEGATIVE_RETRY_DAYS)


def resolve_coordinates(
    providers: list[Provider], db: Session
) -> dict[str, tuple[float, float]]:
    """
    Street-level coordinates for as many providers as can be placed.

    Cache first, then one batch request for whatever is left. A provider that
    is absent from the result simply has no coordinate, and the caller falls
    back to the ZIP centroid.

    Never raises. Distance is an enhancement on a list of providers that has
    already been fetched, so nothing here is allowed to cost the user their
    search results.
    """
    if not providers:
        return {}

    signatures = {p.npi: _address_signature(p) for p in providers if p.npi}
    if not signatures:
        return {}

    rows = {
        row.npi: row
        for row in db.query(ProviderLocation)
        .filter(ProviderLocation.npi.in_(list(signatures)))
        .all()
    }

    placed: dict[str, tuple[float, float]] = {}
    to_ask: list[Provider] = []

    for provider in providers:
        if not provider.npi:
            continue
        row = rows.get(provider.npi)
        if row is not None and _is_fresh(row, signatures[provider.npi]):
            if row.has_coordinates():
                placed[provider.npi] = (row.latitude, row.longitude)
            continue
        to_ask.append(provider)

    if not to_ask:
        return placed

    try:
        answers = geocode_addresses(
            [
                AddressToGeocode(
                    key=provider.npi,
                    street=provider.address_line,
                    city=provider.city,
                    state=provider.state,
                    postal_code=provider.postal_code,
                )
                for provider in to_ask
            ]
        )
    except (GeocoderUnavailable, ValueError) as exc:
        # An outage costs precision, not results. Nothing is written, so the
        # next search tries again rather than caching a silence as a failure.
        logger.warning("Address geocoding unavailable: %s", exc)
        return placed

    now = datetime.now(timezone.utc)
    for provider in to_ask:
        if provider.npi not in answers:
            # Not answered for at all. Distinct from "answered, no match" -
            # only the latter is worth remembering.
            continue

        coordinate = answers[provider.npi]
        row = rows.get(provider.npi)
        if row is None:
            row = ProviderLocation(npi=provider.npi)
            db.add(row)

        row.latitude = coordinate[0] if coordinate else None
        row.longitude = coordinate[1] if coordinate else None
        row.geocoded_address = signatures[provider.npi]
        row.checked_at = now

        if coordinate:
            placed[provider.npi] = coordinate

    db.commit()
    return placed


def distance_for(
    from_zip: str | None,
    provider: Provider,
    coordinate: tuple[float, float] | None,
) -> float | None:
    """
    Miles from the searched ZIP's centroid to this provider.

    Exact where the address could be placed, the old centroid-to-centroid
    estimate where it could not, and **None where that estimate would be a
    zero**.

    That last rule is the point of this function. A same-ZIP provider with no
    coordinate measures zero miles from its own ZIP's centroid, and zero
    renders as "~0.0 mi", which reads as "next door" for a clinic that may be
    three miles away. `zip_geography` already documents that a wrong distance
    is worse than an absent one for someone deciding how far to travel while
    unwell; a zero here is the wrong distance, so it is not shown.
    """
    if coordinate is not None:
        origin = centroid(from_zip)
        if origin is None:
            return None
        return haversine_miles(origin[0], origin[1], coordinate[0], coordinate[1])

    estimate = distance_miles(from_zip, provider.postal_code)
    if estimate is None or estimate == 0.0:
        return None
    return estimate


def distances_for(
    providers: list[Provider], from_zip: str | None, db: Session
) -> dict[str, float | None]:
    """Distance per NPI, ready for the API layer to attach to each row."""
    placed = resolve_coordinates(providers, db)
    return {
        provider.npi: distance_for(from_zip, provider, placed.get(provider.npi))
        for provider in providers
    }
