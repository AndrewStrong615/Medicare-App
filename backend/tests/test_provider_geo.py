"""
Tests for how a provider's distance is decided.

Covers the cache (so the geocoder is not re-asked), the fallback path (so an
outage costs precision and not results), and the rule that a zero is never
shown. All providers and addresses are synthetic.

The `_no_live_geocoding` fixture in conftest.py already blocks real network
calls; every test here installs its own stub on top of that.
"""

from datetime import datetime, timedelta, timezone

import pytest

import app.services.provider_geo as provider_geo
from app.models.provider_location import ProviderLocation
from app.services.address_geocoder import GeocoderUnavailable
from app.services.provider_directory import Provider
from app.services.provider_geo import (
    NEGATIVE_RETRY_DAYS,
    distances_for,
    resolve_coordinates,
)

# 40.7506, -73.9973 is the centroid of 10001, so a provider placed a little
# away from it should measure a small but non-zero distance.
NEAR_10001 = (40.7420, -73.9890)


def _provider(npi: str = "1000000001", postal_code: str = "10001") -> Provider:
    return Provider(
        npi=npi,
        name="Synthetic Urgent Care Llc",
        specialty="Clinic/Center, Urgent Care",
        phone="(212) 555-0143",
        address_line="1 Synthetic Plaza",
        city="New York",
        state="NY",
        postal_code=postal_code,
    )


class _Geocoder:
    """Records what it was asked, answers from a fixed table."""

    def __init__(self, answers: dict, error: Exception | None = None):
        self.answers = answers
        self.error = error
        self.calls: list[list[str]] = []

    def __call__(self, entries):
        self.calls.append([entry.key for entry in entries])
        if self.error is not None:
            raise self.error
        return {key: self.answers.get(key) for key in (e.key for e in entries)}


def _install(monkeypatch, geocoder) -> None:
    monkeypatch.setattr(provider_geo, "geocode_addresses", geocoder)


# --------------------------------------------------------------------------
# The distance itself
# --------------------------------------------------------------------------


def test_a_provider_in_the_searched_zip_gets_a_real_distance(monkeypatch, db_session):
    """
    The bug this feature exists for.

    Before geocoding, a provider in the ZIP the user searched measured its own
    ZIP's centroid against itself — exactly zero — so a whole page of results
    read "~0.0 mi" and could not be used to choose between them.
    """
    _install(monkeypatch, _Geocoder({"1000000001": NEAR_10001}))

    distances = distances_for([_provider()], "10001", db_session)

    assert distances["1000000001"] is not None
    assert 0.1 < distances["1000000001"] < 3


def test_two_providers_in_one_zip_get_different_distances(monkeypatch, db_session):
    """The point of street-level placement: same ZIP, different answers."""
    _install(
        monkeypatch,
        _Geocoder(
            {
                "1000000001": (40.7420, -73.9890),
                "1000000002": (40.7900, -73.9500),
            }
        ),
    )

    distances = distances_for(
        [_provider("1000000001"), _provider("1000000002")], "10001", db_session
    )

    assert distances["1000000001"] != distances["1000000002"]
    assert distances["1000000001"] < distances["1000000002"]


def test_an_unplaceable_provider_in_the_searched_zip_shows_no_distance(
    monkeypatch, db_session
):
    """
    Not a zero. A zero renders as "~0.0 mi", which reads as "next door" for a
    clinic that may be three miles away; an absent distance is rendered as no
    distance at all, which is the truth.
    """
    _install(monkeypatch, _Geocoder({"1000000001": None}))

    distances = distances_for([_provider()], "10001", db_session)

    assert distances["1000000001"] is None


def test_an_unplaceable_provider_in_another_zip_falls_back_to_the_estimate(
    monkeypatch, db_session
):
    """The centroid estimate is still worth showing when the ZIPs differ."""
    _install(monkeypatch, _Geocoder({"1000000001": None}))

    distances = distances_for([_provider(postal_code="10001")], "10002", db_session)

    assert distances["1000000001"] is not None
    assert distances["1000000001"] > 0


def test_an_unknown_zip_yields_no_distance(monkeypatch, db_session):
    _install(monkeypatch, _Geocoder({"1000000001": None}))

    distances = distances_for(
        [_provider(postal_code="09999")], "10001", db_session
    )

    assert distances["1000000001"] is None


# --------------------------------------------------------------------------
# Failure never costs results
# --------------------------------------------------------------------------


def test_a_geocoder_outage_falls_back_instead_of_raising(monkeypatch, db_session):
    """
    The providers are already in hand by the time this runs. An outage must
    cost accuracy, never the search results.
    """
    _install(
        monkeypatch, _Geocoder({}, error=GeocoderUnavailable("service is down"))
    )

    distances = distances_for([_provider(postal_code="10001")], "10002", db_session)

    assert distances["1000000001"] is not None, "fell back to the ZIP estimate"


def test_an_outage_caches_nothing(monkeypatch, db_session):
    """
    A silence is not an answer. Writing one would stop the next search from
    trying again once the service is back.
    """
    _install(
        monkeypatch, _Geocoder({}, error=GeocoderUnavailable("service is down"))
    )

    resolve_coordinates([_provider()], db_session)

    assert db_session.query(ProviderLocation).count() == 0


def test_a_provider_with_no_npi_is_skipped(monkeypatch, db_session):
    """The NPI is the cache key; without one there is nothing to key on."""
    geocoder = _Geocoder({})
    _install(monkeypatch, geocoder)

    resolve_coordinates([_provider(npi="")], db_session)

    assert geocoder.calls == []


# --------------------------------------------------------------------------
# The cache
# --------------------------------------------------------------------------


def test_a_placed_address_is_not_geocoded_twice(monkeypatch, db_session):
    """
    A geocoding request reveals which area was searched. A provider's address
    does not move, so re-sending it on every search would leak that signal
    repeatedly for no benefit.
    """
    geocoder = _Geocoder({"1000000001": NEAR_10001})
    _install(monkeypatch, geocoder)

    first = distances_for([_provider()], "10001", db_session)
    second = distances_for([_provider()], "10001", db_session)

    assert len(geocoder.calls) == 1, "the second search re-asked the geocoder"
    assert first == second, "the cache changed the answer"


def test_an_unplaceable_address_is_not_re_asked_immediately(monkeypatch, db_session):
    """A definite "could not place this" is worth remembering too."""
    geocoder = _Geocoder({"1000000001": None})
    _install(monkeypatch, geocoder)

    resolve_coordinates([_provider()], db_session)
    resolve_coordinates([_provider()], db_session)

    assert len(geocoder.calls) == 1


def test_an_unplaceable_address_is_re_asked_eventually(monkeypatch, db_session):
    """So a correction in the registry is eventually picked up."""
    geocoder = _Geocoder({"1000000001": None})
    _install(monkeypatch, geocoder)
    resolve_coordinates([_provider()], db_session)

    stale = db_session.query(ProviderLocation).one()
    stale.checked_at = datetime.now(timezone.utc) - timedelta(
        days=NEGATIVE_RETRY_DAYS + 1
    )
    db_session.commit()

    resolve_coordinates([_provider()], db_session)

    assert len(geocoder.calls) == 2


def test_a_provider_that_moves_is_placed_again(monkeypatch, db_session):
    """
    A cached coordinate never expires on its own, because a street address is
    a fact. A clinic changing premises is caught by the address changing, not
    by a clock — without that it would be shown at its old address forever.
    """
    geocoder = _Geocoder({"1000000001": NEAR_10001})
    _install(monkeypatch, geocoder)
    resolve_coordinates([_provider()], db_session)

    moved = Provider(
        npi="1000000001",
        name="Synthetic Urgent Care Llc",
        specialty="Clinic/Center, Urgent Care",
        phone="(212) 555-0143",
        address_line="99 Somewhere Else Blvd",
        city="New York",
        state="NY",
        postal_code="10001",
    )
    resolve_coordinates([moved], db_session)

    assert len(geocoder.calls) == 2
    assert db_session.query(ProviderLocation).count() == 1, "one row per provider"


def test_only_uncached_providers_are_sent(monkeypatch, db_session):
    geocoder = _Geocoder(
        {"1000000001": NEAR_10001, "1000000002": (40.80, -73.95)}
    )
    _install(monkeypatch, geocoder)

    resolve_coordinates([_provider("1000000001")], db_session)
    resolve_coordinates(
        [_provider("1000000001"), _provider("1000000002")], db_session
    )

    assert geocoder.calls == [["1000000001"], ["1000000002"]]


def test_the_cache_table_holds_no_user_column():
    """
    This is a cache of public provider addresses, not a log of who searched
    for what. A user column would turn it into a record of which clinics a
    named person was looking for, which is health data about them.
    """
    columns = set(ProviderLocation.__table__.columns.keys())

    assert not {"user_id", "user", "searched_by", "search_term"} & columns
    assert columns == {
        "npi",
        "latitude",
        "longitude",
        "geocoded_address",
        "checked_at",
    }


def test_no_provider_yields_no_call(monkeypatch, db_session):
    geocoder = _Geocoder({})
    _install(monkeypatch, geocoder)

    assert resolve_coordinates([], db_session) == {}
    assert geocoder.calls == []
