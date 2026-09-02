"""
Tests for the Census batch-geocoder client.

The response format is parsed from fixed CSV samples shaped like real answers
from the service, so nothing here touches the network. Every address below is
synthetic.
"""

import httpx
import pytest

from app.services.address_geocoder import (
    AddressToGeocode,
    GeocoderUnavailable,
    MAX_BATCH_SIZE,
    geocode_addresses,
    parse_batch_response,
)

# A real answer's shape: quoted fields, a "Match"/"No_Match" indicator, and a
# coordinate written LONGITUDE FIRST.
SAMPLE = (
    '"1000000002","150 E Harmon Ave, Las Vegas, NV, 89109","Match","Exact",'
    '"150 E HARMON AVE, LAS VEGAS, NV, 89109","-115.166701,36.108079",'
    '"650056671","L"\n'
    '"1000000001","3281 S Highland Dr, Las Vegas, NV, 89109","Match","Exact",'
    '"3281 S HIGHLAND DR, LAS VEGAS, NV, 89109","-115.177662,36.130369",'
    '"201984833","R"\n'
    '"1000000003","2971 S Nowhere Dr, Las Vegas, NV, 89109","No_Match"\n'
)


def test_rows_are_keyed_by_id_not_by_position():
    """
    The service answers in an order of its own choosing.

    The sample above comes back with the second address first, which is what
    real answers do. Matching by position would attach one clinic's coordinate
    to another clinic's name — a wrong address for a named provider, which is
    worse than no address at all.
    """
    resolved = parse_batch_response(SAMPLE)

    assert resolved["1000000001"] == pytest.approx((36.130369, -115.177662))
    assert resolved["1000000002"] == pytest.approx((36.108079, -115.166701))


def test_coordinates_are_read_longitude_first():
    """
    The service writes "longitude,latitude"; everything else in this app is
    (latitude, longitude). Reading them in the wrong order puts a Las Vegas
    clinic in the southern ocean, so this asserts the values land the right
    way round rather than merely being present.
    """
    latitude, longitude = parse_batch_response(SAMPLE)["1000000001"]

    assert 36 < latitude < 37, "latitude and longitude are swapped"
    assert -116 < longitude < -115


def test_an_unmatched_address_is_recorded_as_a_definite_none():
    """
    None means "asked, could not place it" — worth caching so the same bad
    address is not re-sent on every search.
    """
    resolved = parse_batch_response(SAMPLE)

    assert "1000000003" in resolved
    assert resolved["1000000003"] is None


def test_a_malformed_coordinate_is_not_guessed_at():
    body = (
        '"1000000004","1 Synthetic Way, Nowhere, NY, 10001","Match","Exact",'
        '"1 SYNTHETIC WAY","not-a-coordinate","1","L"\n'
    )

    assert parse_batch_response(body)["1000000004"] is None


def test_an_impossible_coordinate_is_refused():
    """
    Out of range means the parse went wrong — most likely the lon/lat order
    changing upstream. Refusing beats placing a provider somewhere impossible.
    """
    body = (
        '"1000000005","1 Synthetic Way, Nowhere, NY, 10001","Match","Exact",'
        '"1 SYNTHETIC WAY","-115.1,915.0","1","L"\n'
    )

    assert parse_batch_response(body)["1000000005"] is None


def test_a_truncated_row_does_not_raise():
    assert parse_batch_response('"1000000006"\n\n') == {}


def test_an_address_with_no_street_is_never_sent():
    """
    A row with no street matches the centre of a city or ZIP, which is exactly
    the imprecision this module exists to remove — it would look like a
    precise answer while being no better than the centroid it replaced.
    """
    entry = AddressToGeocode(
        key="1000000007",
        street=None,
        city="Las Vegas",
        state="NV",
        postal_code="89109",
    )

    assert entry.is_complete() is False
    # Nothing sendable means no request is made at all.
    assert geocode_addresses([entry], client=_ExplodingClient()) == {}


def test_an_address_with_a_street_and_a_zip_is_sent():
    entry = AddressToGeocode(
        key="1000000008",
        street="1 Synthetic Way",
        city=None,
        state=None,
        postal_code="10001",
    )

    assert entry.is_complete() is True


def test_an_oversized_batch_is_refused_rather_than_truncated():
    entries = [
        AddressToGeocode(
            key=str(n), street="1 Synthetic Way", city="Nowhere", state="NY",
            postal_code="10001",
        )
        for n in range(MAX_BATCH_SIZE + 1)
    ]

    with pytest.raises(ValueError):
        geocode_addresses(entries, client=_ExplodingClient())


class _ExplodingClient:
    """Fails the test if a request is made."""

    def post(self, *args, **kwargs):  # pragma: no cover - must not be reached
        raise AssertionError("no request should have been made")

    def close(self):
        pass


class _StubClient:
    def __init__(self, handler):
        self._handler = handler
        self.requests: list[dict] = []

    def post(self, url, data=None, files=None):
        self.requests.append({"url": url, "data": data, "files": files})
        return self._handler()

    def close(self):
        pass


def _response(status: int = 200, text: str = SAMPLE) -> httpx.Response:
    return httpx.Response(
        status_code=status,
        text=text,
        request=httpx.Request("POST", "https://example.invalid/"),
    )


def test_a_successful_batch_is_parsed():
    client = _StubClient(lambda: _response())

    resolved = geocode_addresses(
        [
            AddressToGeocode(
                key="1000000001", street="3281 S Highland Dr", city="Las Vegas",
                state="NV", postal_code="89109",
            )
        ],
        client=client,
    )

    assert resolved["1000000001"] == pytest.approx((36.130369, -115.177662))
    assert len(client.requests) == 1, "one call should cover the whole batch"


def test_the_request_carries_only_the_address_columns():
    """
    Nothing about the user may reach this service. The upload is id, street,
    city, state, ZIP — all of it published by NPPES about the clinic — and the
    only other field is the pinned benchmark.
    """
    client = _StubClient(lambda: _response())

    geocode_addresses(
        [
            AddressToGeocode(
                key="1000000001", street="3281 S Highland Dr", city="Las Vegas",
                state="NV", postal_code="89109",
            )
        ],
        client=client,
    )

    sent = client.requests[0]
    assert set(sent["data"]) == {"benchmark"}
    uploaded = sent["files"]["addressFile"][1].decode()
    assert uploaded.strip() == "1000000001,3281 S Highland Dr,Las Vegas,NV,89109"


def test_an_http_error_becomes_geocoder_unavailable():
    def boom():
        raise httpx.ConnectError("no route to host")

    with pytest.raises(GeocoderUnavailable):
        geocode_addresses(
            [
                AddressToGeocode(
                    key="1", street="1 Synthetic Way", city="Nowhere",
                    state="NY", postal_code="10001",
                )
            ],
            client=_StubClient(boom),
        )


def test_a_server_error_becomes_geocoder_unavailable():
    with pytest.raises(GeocoderUnavailable):
        geocode_addresses(
            [
                AddressToGeocode(
                    key="1", street="1 Synthetic Way", city="Nowhere",
                    state="NY", postal_code="10001",
                )
            ],
            client=_StubClient(lambda: _response(status=503, text="")),
        )
