"""
ZIP code geography: where a ZIP is, and how far apart two of them are.

Backed by a committed extract of the US Census ZCTA Gazetteer (public domain) -
see `scripts/build_zip_centroids.py`. No network call, no API key, no vendor.

Why this is here rather than on the device
------------------------------------------
Two callers need it, and neither can be served by the phone alone.

1. **Coordinate to ZIP, for the web build.** A browser can say where the user
   is but cannot say what ZIP that is - it has no geocoder, and
   `expo-location` throws on web for that reason. The provider directory is
   searched by ZIP, so without this step the browser's Geolocation API is
   useless to this app. The alternative was a third-party geocoding service,
   which would hand a health app's user coordinates to a vendor with no
   agreement in place. This keeps them inside MedHelp.

2. **Distances, for every platform.** These used to be computed on the device
   from the OS geocoder, which meant they simply did not exist on web, and
   meant twenty providers cost twenty geocoder lookups on a phone. Computing
   them here reveals nothing new: the backend is already told the searched ZIP
   and already returns each provider's ZIP, so the distance between them is
   derived from data it holds either way.

What this is not
----------------
A geocoder. It resolves coordinates to the *nearest ZIP centroid*, which is a
coarse answer by construction, and it refuses rather than guessing when the
nearest one is implausibly far away (someone outside the US, or a bad fix).

Distances are straight-line between centroids. They are not driving distances
and the UI renders them with a "~" for that reason.
"""

from __future__ import annotations

import csv
import gzip
import io
import math
from functools import lru_cache
from pathlib import Path

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "zcta_centroids.csv.gz"

EARTH_RADIUS_MILES = 3958.8

# Roughly the distance one degree of latitude covers. Used only to size the
# search window below, so an approximation is fine.
MILES_PER_DEGREE_LATITUDE = 69.0

# How far from a coordinate we will still call a ZIP "yours".
#
# Generous, because ZCTA centroids in the rural west are genuinely tens of
# miles from where people stand, and a user in Nevada should still get a
# sensible ZIP. Beyond this the honest answer is "we don't know" - a fix in the
# middle of the Atlantic must not resolve to a coastal ZIP.
MAX_RESOLVE_MILES = 75.0


def _to_radians(degrees: float) -> float:
    return degrees * math.pi / 180.0


def haversine_miles(
    from_lat: float, from_lon: float, to_lat: float, to_lon: float
) -> float:
    """Great-circle distance in miles. Straight line, not driving distance."""
    d_lat = _to_radians(to_lat - from_lat)
    d_lon = _to_radians(to_lon - from_lon)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(_to_radians(from_lat))
        * math.cos(_to_radians(to_lat))
        * math.sin(d_lon / 2) ** 2
    )
    return EARTH_RADIUS_MILES * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


@lru_cache(maxsize=1)
def _centroids() -> tuple[dict[str, tuple[float, float]], dict[int, list[tuple[str, float, float]]]]:
    """
    Load the table once, as a ZIP lookup plus an index bucketed by whole degree
    of latitude.

    The bucketing is what keeps `nearest_zip` cheap: a nearest-neighbour search
    over 33,000 points is fine once, and wasteful on every request. Only the
    few latitude bands that could possibly contain a closer point are scanned.
    """
    by_zip: dict[str, tuple[float, float]] = {}
    by_band: dict[int, list[tuple[str, float, float]]] = {}

    with gzip.open(DATA_FILE, "rb") as raw:
        reader = csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8"))
        for row in reader:
            zip_code = row["zip"]
            latitude = float(row["lat"])
            longitude = float(row["lon"])
            by_zip[zip_code] = (latitude, longitude)
            by_band.setdefault(math.floor(latitude), []).append(
                (zip_code, latitude, longitude)
            )

    return by_zip, by_band


def clean_zip(raw: str | None) -> str | None:
    """The 5 digits a ZIP search needs, or None if there aren't 5 of them."""
    if not raw:
        return None
    digits = "".join(character for character in raw if character.isdigit())
    return digits[:5] if len(digits) >= 5 else None


def centroid(postal_code: str | None) -> tuple[float, float] | None:
    """The centroid of a ZIP, or None if it isn't a ZCTA we know."""
    zip5 = clean_zip(postal_code)
    if zip5 is None:
        return None
    return _centroids()[0].get(zip5)


def distance_miles(from_zip: str | None, to_zip: str | None) -> float | None:
    """
    Straight-line miles between two ZIP centroids, or None when either is
    unknown.

    None is an ordinary outcome the UI already renders as "no distance shown" -
    it never becomes a zero or a placeholder, because a wrong distance is worse
    than an absent one for someone deciding how far to travel while unwell.
    """
    start = centroid(from_zip)
    end = centroid(to_zip)
    if start is None or end is None:
        return None
    return haversine_miles(start[0], start[1], end[0], end[1])


def nearest_zip(latitude: float, longitude: float) -> str | None:
    """
    The ZIP whose centroid is closest to a coordinate, or None if none is
    plausibly close.

    Returning None matters as much as returning a ZIP: a coordinate outside the
    US would otherwise silently resolve to whichever American ZIP happens to be
    least far away, and the user would be shown providers on the wrong
    continent.
    """
    if not (-90.0 <= latitude <= 90.0 and -180.0 <= longitude <= 180.0):
        return None

    _, by_band = _centroids()
    band_reach = max(1, math.ceil(MAX_RESOLVE_MILES / MILES_PER_DEGREE_LATITUDE))
    centre_band = math.floor(latitude)

    best_zip: str | None = None
    best_distance = MAX_RESOLVE_MILES

    for band in range(centre_band - band_reach, centre_band + band_reach + 1):
        for zip_code, zip_lat, zip_lon in by_band.get(band, ()):
            miles = haversine_miles(latitude, longitude, zip_lat, zip_lon)
            if miles < best_distance:
                best_distance = miles
                best_zip = zip_code

    return best_zip


def is_loaded() -> bool:
    """Whether the dataset file is present. Used by a startup check."""
    return DATA_FILE.exists()
