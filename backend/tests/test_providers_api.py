"""
Tests for the provider-search endpoint and the delivery seam behind it.

NPPES is stubbed out here; `test_provider_directory.py` covers the client
itself. Synthetic providers only.
"""

import pytest

from app.api import providers as providers_api
from app.services.provider_directory import Provider, ProviderDirectoryUnavailable
from app.services.request_delivery import (
    DeliveryUnavailable,
    delivery_available,
    deliver_request,
)

SYNTHETIC_PROVIDER = Provider(
    npi="1000000001",
    name="Synthetic Urgent Care Llc",
    specialty="Clinic/Center, Urgent Care",
    phone="(212) 555-0143",
    address_line="1 Synthetic Plaza",
    city="New York",
    state="NY",
    postal_code="10001",
)


@pytest.fixture()
def stub_directory(monkeypatch):
    calls: list[tuple] = []

    def _search(postal_code, care_setting, limit):
        calls.append((postal_code, care_setting, limit))
        return [SYNTHETIC_PROVIDER]

    monkeypatch.setattr(providers_api, "search_providers", _search)
    return calls


def test_search_returns_providers(client, auth_headers, stub_directory):
    response = client.get(
        "/providers/search?postal_code=10001&care_setting=urgent_care",
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["providers"]) == 1
    provider = body["providers"][0]
    assert provider["name"] == "Synthetic Urgent Care Llc"
    assert provider["address"] == "1 Synthetic Plaza, New York, NY, 10001"
    # Attribution travels with the data, as it does for MedlinePlus.
    assert "NPPES" in provider["source_name"]


def test_search_reports_that_online_booking_does_not_exist(
    client, auth_headers, stub_directory
):
    """
    The screens read this flag instead of hard-coding "call them yourself", so
    that the day a booking channel is procured, the UI stops lying by omission
    rather than having to be found and edited.
    """
    response = client.get(
        "/providers/search?postal_code=10001", headers=auth_headers
    )
    assert response.json()["online_booking_available"] is False


def test_no_provider_carries_an_availability_field(
    client, auth_headers, stub_directory
):
    """
    Nothing in the payload may look like a bookable slot. A field here would
    invite a screen to render "next available", which would be invented.
    """
    response = client.get(
        "/providers/search?postal_code=10001", headers=auth_headers
    )
    provider = response.json()["providers"][0]
    for forbidden in ("next_available", "slots", "availability", "next_slot"):
        assert forbidden not in provider


def test_an_unknown_care_setting_is_rejected(client, auth_headers, monkeypatch):
    def _search(postal_code, care_setting, limit):
        raise ValueError("Unknown care setting.")

    monkeypatch.setattr(providers_api, "search_providers", _search)
    response = client.get(
        "/providers/search?postal_code=10001&care_setting=oncology",
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_a_directory_outage_is_reported_not_hidden(
    client, auth_headers, monkeypatch
):
    """
    503, not an empty list. "We can't reach the directory" and "there is no
    urgent care near you" must never look the same to the user.
    """

    def _search(postal_code, care_setting, limit):
        raise ProviderDirectoryUnavailable("boom")

    monkeypatch.setattr(providers_api, "search_providers", _search)
    response = client.get(
        "/providers/search?postal_code=10001", headers=auth_headers
    )
    assert response.status_code == 503
    assert "unavailable" in response.json()["detail"].lower()


def test_provider_search_requires_authentication(client):
    assert client.get("/providers/search?postal_code=10001").status_code == 401


def test_care_settings_are_all_settings_not_conditions(client, auth_headers):
    """
    The care setting is transmitted to CMS. A setting ("Urgent Care") says
    nothing about the person searching; a condition ("Oncology") would.
    """
    response = client.get("/providers/care-settings", headers=auth_headers)
    assert response.status_code == 200
    values = set(response.json().values())
    assert values == {
        "Urgent Care",
        "Family Medicine",
        "Internal Medicine",
        "Pediatrics",
        "Emergency Medicine",
        "General Practice",
        "General Acute Care Hospital",
    }


def test_delivery_is_unavailable_and_says_so_loudly():
    """
    The seam must stay shut until a BAA-covered channel exists. A silent
    no-op would let a caller report success for a request that went nowhere.
    """
    assert delivery_available() is False
    with pytest.raises(DeliveryUnavailable):
        # Identity is a separate argument from the stored appointment on
        # purpose: one is persisted, the other never is.
        deliver_request(None, None)  # type: ignore[arg-type]


def test_every_provider_carries_a_distance_from_the_searched_zip(
    client, auth_headers, stub_directory
):
    """
    Distances are computed here, not on the device.

    They used to be worked out on the phone from the OS geocoder, which meant
    the web build showed none at all - a browser has no geocoder - and meant a
    twenty-row result cost twenty geocoder lookups. This endpoint is already
    told the searched ZIP and already returns each provider's, so measuring
    between them reveals nothing new and works on every platform at once.
    """
    response = client.get(
        "/providers/search?postal_code=10002&care_setting=urgent_care",
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    provider = response.json()["providers"][0]
    # The synthetic provider is in 10001; the search was for 10002.
    assert provider["distance_miles"] is not None
    assert 0 < provider["distance_miles"] < 5


def test_an_unmeasurable_distance_is_null_not_zero(
    client, auth_headers, monkeypatch
):
    """
    A zero renders as "~0.0 mi", which reads as "next door". An absent distance
    is rendered as no distance at all, which is the truth.
    """
    unknown = Provider(
        npi="1000000002",
        name="SYNTHETIC CLINIC",
        specialty="Clinic/Center, Urgent Care",
        phone="2125550143",
        address_line="2 Synthetic Way",
        city="Nowhere",
        state="NY",
        postal_code="09999",
    )
    monkeypatch.setattr(
        providers_api, "search_providers", lambda *args, **kwargs: [unknown]
    )
    response = client.get(
        "/providers/search?postal_code=10001&care_setting=urgent_care",
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["providers"][0]["distance_miles"] is None


def test_a_coordinate_resolves_to_a_zip(client, auth_headers):
    """
    The web build's whole reason for this endpoint: a browser can say where the
    user is but cannot say what ZIP that is.
    """
    response = client.post(
        "/providers/resolve-location",
        json={"latitude": 40.7484, "longitude": -73.9857},
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["postal_code"].startswith("10")


def test_a_coordinate_outside_the_us_resolves_to_nothing(client, auth_headers):
    response = client.post(
        "/providers/resolve-location",
        json={"latitude": 51.5074, "longitude": -0.1278},
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["postal_code"] is None


def test_an_impossible_coordinate_is_rejected(client, auth_headers):
    response = client.post(
        "/providers/resolve-location",
        json={"latitude": 999, "longitude": 0},
        headers=auth_headers,
    )
    assert response.status_code == 422


def test_resolving_a_location_requires_authentication(client):
    response = client.post(
        "/providers/resolve-location",
        json={"latitude": 40.7484, "longitude": -73.9857},
    )
    assert response.status_code == 401


def test_a_rejected_coordinate_is_not_echoed_back(client, auth_headers):
    """
    A position is not something to hand back into client logs and crash
    reporters - the same rule the rejected password and symptom text follow.
    """
    response = client.post(
        "/providers/resolve-location",
        json={"latitude": 999.12345, "longitude": -73.98765},
        headers=auth_headers,
    )
    assert response.status_code == 422
    assert "999.12345" not in response.text
    assert "73.98765" not in response.text


def test_a_hospital_is_searchable_because_it_is_a_setting(
    client, auth_headers, stub_directory
):
    """
    People look for "a hospital", and until now the list offered only
    physician specialties - "Emergency medicine" is the doctor, not the
    building. A hospital is a place of care, so it says nothing clinical about
    the person searching and is safe to send to CMS.
    """
    response = client.get(
        "/providers/search?postal_code=75214&care_setting=hospital",
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    assert stub_directory[-1][1] == "hospital"


def test_a_same_zip_provider_is_placed_by_street_address(
    client, auth_headers, stub_directory, monkeypatch
):
    """
    The reported bug: "the find providers tab shows the distances as all 0
    miles".

    `search_providers` queries NPPES by the exact ZIP first, so most results
    sit in the ZIP the user searched — and a ZIP's centroid is zero miles from
    itself. Geocoding the street address replaces the provider half of that
    measurement with a real point, so a whole page no longer reads "~0.0 mi".
    """
    import app.services.provider_geo as provider_geo

    # 10001's centroid is 40.7506, -73.9973; the synthetic clinic is in 10001
    # but not at its centre.
    monkeypatch.setattr(
        provider_geo,
        "geocode_addresses",
        lambda entries: {"1000000001": (40.7420, -73.9890)},
    )

    response = client.get(
        "/providers/search?postal_code=10001&care_setting=urgent_care",
        headers=auth_headers,
    )

    assert response.status_code == 200, response.text
    distance = response.json()["providers"][0]["distance_miles"]
    assert distance is not None
    assert distance > 0.1, "a same-ZIP provider collapsed back to zero"
    assert distance < 3


def test_a_same_zip_provider_never_reports_zero(
    client, auth_headers, stub_directory
):
    """
    With no geocoded coordinate available — the conftest default — the
    fallback is the old centroid estimate, which for a same-ZIP provider is
    exactly zero. Zero renders as "~0.0 mi" and reads as "next door", so the
    endpoint reports no distance instead of a number it knows to be wrong.
    """
    response = client.get(
        "/providers/search?postal_code=10001&care_setting=urgent_care",
        headers=auth_headers,
    )

    assert response.status_code == 200, response.text
    assert response.json()["providers"][0]["distance_miles"] is None


def test_a_search_records_nothing_about_the_caller(
    client, auth_headers, stub_directory, monkeypatch, db_session
):
    """
    Provider search now writes to the database, which it did not before.

    What it writes is a cache of public provider addresses. There must be no
    row anywhere saying that *this* user searched for urgent care near 10001 —
    that would be a record of a named person looking for a kind of care, which
    is health data about them.
    """
    import app.services.provider_geo as provider_geo
    from app.models.provider_location import ProviderLocation

    monkeypatch.setattr(
        provider_geo,
        "geocode_addresses",
        lambda entries: {"1000000001": (40.7420, -73.9890)},
    )

    response = client.get(
        "/providers/search?postal_code=10001&care_setting=urgent_care",
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text

    rows = db_session.query(ProviderLocation).all()
    assert len(rows) == 1
    row = rows[0]
    # Everything stored is published by NPPES about the clinic.
    assert row.npi == "1000000001"
    assert row.latitude is not None and row.longitude is not None
    assert "Synthetic Plaza" in (row.geocoded_address or "")
    # And there is nowhere for a caller to be recorded.
    assert "user_id" not in ProviderLocation.__table__.columns.keys()
