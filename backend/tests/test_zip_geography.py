"""
ZIP geography: coordinate -> ZIP, and ZIP -> ZIP distance.

This exists so the web build can use the browser's Geolocation API at all. A
browser gives a position but has no geocoder, and the provider directory is
searched by ZIP, so without this step location on the web is useless.

The properties worth defending are about *refusing to guess*. A geocoder that
always returns something is worse than one that says it doesn't know: a
coordinate in the Atlantic resolving to a coastal ZIP would put a user in front
of providers hundreds of miles away, and a distance that is confidently wrong
is worse for someone deciding how far to travel while unwell than no distance
at all.
"""

import pytest

from app.services import zip_geography


def test_the_dataset_is_present_and_substantial():
    # Committed, not fetched: no network call and no vendor at request time.
    assert zip_geography.is_loaded()
    by_zip, _ = zip_geography._centroids()
    assert len(by_zip) > 30_000


@pytest.mark.parametrize(
    "label, latitude, longitude, expected_prefix",
    [
        ("Manhattan", 40.7484, -73.9857, "10"),
        ("Beverly Hills", 34.0736, -118.4004, "902"),
        ("Seattle", 47.6205, -122.3493, "981"),
        ("Bozeman", 45.6770, -111.0429, "597"),
        ("Anchorage", 61.2181, -149.9003, "995"),
        ("Honolulu", 21.3069, -157.8583, "968"),
    ],
)
def test_a_coordinate_resolves_to_a_zip_in_the_right_place(
    label, latitude, longitude, expected_prefix
):
    resolved = zip_geography.nearest_zip(latitude, longitude)
    assert resolved is not None, label
    assert resolved.startswith(expected_prefix), f"{label}: got {resolved}"


@pytest.mark.parametrize(
    "label, latitude, longitude",
    [
        ("mid-Atlantic", 35.0, -45.0),
        ("London", 51.5074, -0.1278),
        ("null island", 0.0, 0.0),
        ("Antarctica", -82.0, 40.0),
    ],
)
def test_a_coordinate_far_from_any_us_zip_resolves_to_nothing(
    label, latitude, longitude
):
    # The important half. Silently returning the least-far American ZIP would
    # show someone providers on another continent.
    assert zip_geography.nearest_zip(latitude, longitude) is None, label


def test_an_impossible_coordinate_is_refused():
    assert zip_geography.nearest_zip(91.0, 0.0) is None
    assert zip_geography.nearest_zip(0.0, 181.0) is None


def test_distance_between_neighbouring_zips_is_small():
    miles = zip_geography.distance_miles("10001", "10002")
    assert miles is not None
    assert 0 < miles < 5


def test_distance_across_the_country_is_large():
    miles = zip_geography.distance_miles("10001", "90210")
    assert miles is not None
    assert 2_000 < miles < 3_000


def test_distance_is_symmetric():
    there = zip_geography.distance_miles("10001", "60601")
    back = zip_geography.distance_miles("60601", "10001")
    assert there == pytest.approx(back)


def test_an_unknown_zip_has_no_distance_rather_than_a_zero():
    # A zero would render as "~0.0 mi" and read as "next door".
    assert zip_geography.distance_miles("10001", "99999") is None
    assert zip_geography.distance_miles(None, "10001") is None
    assert zip_geography.distance_miles("nonsense", "10001") is None


def test_a_zip_plus_four_is_accepted():
    # NPPES stores 9-digit ZIPs; the centroid table is keyed by 5.
    assert zip_geography.centroid("100011234") == zip_geography.centroid("10001")
