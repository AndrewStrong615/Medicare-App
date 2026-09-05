"""
Client for the US Census Bureau's public geocoding service.

Turns a provider's printed street address into a coordinate, so the distance
shown beside them reflects where they actually are rather than where the middle
of their ZIP code is.

    https://geocoding.geo.census.gov/geocoder/

Free, public domain, no key and no registration - the same class of source as
NPPES itself.

## Why this exists

`zip_geography` measures centroid to centroid, which has **no resolution below
one ZIP code**. `search_providers` queries NPPES by the exact ZIP first, so most
results are *in* the ZIP the user searched, and the distance from a ZIP's
centroid to itself is exactly zero. A search of Las Vegas 89109 returned five of
six providers at "~0.0 mi" - reading as "next door" for clinics up to three
miles apart. Geocoding the address fixes the provider half of that calculation.

## What is transmitted, and why that is acceptable

**Only providers' public business addresses.** The street, city, state and ZIP
that NPPES already publishes about a clinic, plus its NPI as the row id.

There is no field on this call that could hold anything about the user: not
their symptoms, not their tier, not their identity, and not their location.
The user's own coordinates are still resolved locally against the committed
Census dataset in `zip_geography` and are still never sent to any third party -
see CLAUDE.md, which draws that distinction explicitly.

What a request does reveal is *which area was searched*, since the addresses in
one batch share a locality. That is why results are cached by NPI in
`provider_locations`: a provider's address does not move, so the same area is
not re-queried on every search.

Because no PHI is transmitted, the Census Bureau does not need to be a business
associate for this call path - the same reasoning that makes the NPPES call
usable today, when no vendor in this project has signed a BAA.

## Failure is not fatal

A geocoding outage costs accuracy, never results. `search_providers` has
already returned the providers by the time this runs; callers fall back to the
ZIP-centroid estimate. The provider list is the product and the distance is an
enhancement on top of it.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass

import httpx

GEOCODER_ENDPOINT = (
    "https://geocoding.geo.census.gov/geocoder/locations/addressbatch"
)

# The Census Bureau's current address-range benchmark. Pinned rather than left
# to the service's default so a benchmark rotation upstream cannot silently
# change the coordinates this app shows.
BENCHMARK = "Public_AR_Current"

SOURCE_NAME = "US Census Bureau Geocoder"

# Batch geocoding is slower per call than a single lookup and much faster per
# address. One call covers a whole page of results.
REQUEST_TIMEOUT_SECONDS = 30.0

# The service accepts up to 10,000 rows; a search page is at most MAX_RESULTS,
# so this is a guard against a caller passing something unreasonable rather
# than a limit anyone reaches.
MAX_BATCH_SIZE = 500

# Largest response we will read into memory. A 500-row batch answer is well
# under 200 KB; the cap is here so a hostile or broken endpoint cannot exhaust
# this process by streaming without end.
MAX_RESPONSE_BYTES = 8 * 1024 * 1024

# Column offsets in the service's CSV answer. A "No_Match" row is three fields
# long and stops before the coordinate, which is why every read is guarded.
_ID_COLUMN = 0
_MATCH_COLUMN = 2
_COORDINATE_COLUMN = 5


class GeocoderUnavailable(Exception):
    """Raised when the geocoder cannot be reached or its answer cannot be read."""


@dataclass(frozen=True)
class AddressToGeocode:
    """One row of the batch. `key` comes back on the matching answer row."""

    key: str
    street: str | None
    city: str | None
    state: str | None
    postal_code: str | None

    def is_complete(self) -> bool:
        """
        Whether there is enough here to be worth sending.

        A street and something to place it in. Sending a row with no street
        matches the centre of a city or ZIP, which is exactly the imprecision
        this module exists to remove - it would look like a precise answer
        while being no better than the centroid.
        """
        return bool(
            (self.street or "").strip()
            and ((self.city or "").strip() or (self.postal_code or "").strip())
        )


def _build_csv(entries: list[AddressToGeocode]) -> bytes:
    """
    The service's expected upload: no header, one row per address, columns
    id / street / city / state / ZIP.
    """
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    for entry in entries:
        writer.writerow(
            [
                entry.key,
                (entry.street or "").strip(),
                (entry.city or "").strip(),
                (entry.state or "").strip(),
                (entry.postal_code or "").strip(),
            ]
        )
    return buffer.getvalue().encode("utf-8")


def parse_batch_response(body: str) -> dict[str, tuple[float, float] | None]:
    """
    Read the service's CSV answer into `{key: (latitude, longitude) | None}`.

    None means the service was asked and could not place the address. That is a
    real answer and is cached as one, so a bad address is not re-sent on every
    search.

    **Rows come back in an order of the service's choosing, not the order they
    were sent**, so everything is keyed off the id column. Matching by position
    would attach one clinic's coordinate to another's name.

    The coordinate field is `"longitude,latitude"` - longitude first, which is
    the opposite of the order used everywhere else in this app. Getting it
    backwards puts a Las Vegas clinic in Antarctica, so it is unpacked
    explicitly here and nowhere else.
    """
    resolved: dict[str, tuple[float, float] | None] = {}

    for row in csv.reader(io.StringIO(body)):
        if len(row) <= _MATCH_COLUMN:
            continue

        key = row[_ID_COLUMN].strip()
        if not key:
            continue

        if row[_MATCH_COLUMN].strip() != "Match" or len(row) <= _COORDINATE_COLUMN:
            resolved[key] = None
            continue

        parts = row[_COORDINATE_COLUMN].split(",")
        if len(parts) != 2:
            resolved[key] = None
            continue

        try:
            longitude = float(parts[0])
            latitude = float(parts[1])
        except ValueError:
            resolved[key] = None
            continue

        if not (-90.0 <= latitude <= 90.0 and -180.0 <= longitude <= 180.0):
            # A coordinate outside the possible range is a parse that went
            # wrong, most likely the lon/lat order changing upstream. Refuse it
            # rather than placing a provider somewhere impossible.
            resolved[key] = None
            continue

        resolved[key] = (latitude, longitude)

    return resolved


def geocode_addresses(
    entries: list[AddressToGeocode],
    *,
    client: httpx.Client | None = None,
) -> dict[str, tuple[float, float] | None]:
    """
    Place a batch of addresses, in one request.

    Returns an entry for every address the service answered on. A key missing
    from the result was not answered for and should be treated as unknown, not
    as unmatched - the difference matters to the cache, which stores a
    definite "could not place this" but must not store a silence.
    """
    sendable = [entry for entry in entries if entry.is_complete()]
    if not sendable:
        return {}

    if len(sendable) > MAX_BATCH_SIZE:
        raise ValueError(
            f"Batch of {len(sendable)} exceeds the {MAX_BATCH_SIZE}-address limit."
        )

    owns_client = client is None
    client = client or httpx.Client(timeout=REQUEST_TIMEOUT_SECONDS)
    try:
        response = client.post(
            GEOCODER_ENDPOINT,
            data={"benchmark": BENCHMARK},
            files={
                "addressFile": (
                    "addresses.csv",
                    _build_csv(sendable),
                    "text/csv",
                )
            },
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise GeocoderUnavailable(str(exc)) from exc
    finally:
        if owns_client:
            client.close()

    if len(response.content) > MAX_RESPONSE_BYTES:
        raise GeocoderUnavailable("The geocoder returned an unreadable response.")

    return parse_batch_response(response.text)
