"""
Tests for the NPPES directory client.

All fixtures here are synthetic: invented NPIs, invented practice names. No
live call is made - the point of these is the parsing and filtering rules, and
a test that depended on CMS being up would fail for the wrong reason.
"""

import httpx
import pytest

from app.services import provider_directory
from app.services.provider_directory import (
    ProviderDirectoryUnavailable,
    search_providers,
)


def _record(
    npi: str,
    *,
    org: str = "SYNTHETIC URGENT CARE LLC",
    city: str = "NEW YORK",
    state: str = "NY",
    postal: str = "100011810",
    phone: str = "2125550143",
    taxonomy: str = "Clinic/Center, Urgent Care",
    purpose: str = "LOCATION",
) -> dict:
    return {
        "number": npi,
        "basic": {"organization_name": org},
        "addresses": [
            {
                "address_purpose": purpose,
                "address_1": "1 SYNTHETIC PLAZA",
                "city": city,
                "state": state,
                "postal_code": postal,
                "telephone_number": phone,
            }
        ],
        "taxonomies": [{"desc": taxonomy, "primary": True}],
    }


def _client(pages: list[dict]) -> httpx.Client:
    """An httpx client that returns each page in turn."""
    remaining = list(pages)

    def handler(request: httpx.Request) -> httpx.Response:
        payload = remaining.pop(0) if remaining else {"results": []}
        return httpx.Response(200, json=payload)

    return httpx.Client(transport=httpx.MockTransport(handler))


def test_parses_a_provider_into_display_shape():
    with _client([{"results": [_record("1000000001")]}]) as client:
        providers = search_providers("10001", "urgent_care", client=client)

    assert len(providers) == 1
    provider = providers[0]
    assert provider.npi == "1000000001"
    # Upper-case registry data is cased for display.
    assert provider.name == "Synthetic Urgent Care Llc"
    assert provider.phone == "(212) 555-0143"
    assert provider.postal_code == "10001"
    assert provider.full_address == "1 Synthetic Plaza, New York, NY, 10001"


def test_drops_providers_practising_outside_the_searched_area():
    """
    NPPES can match a provider on its mailing ZIP while its practice address
    is in another state. Showing that under "near you" is the bug this guards:
    a Florida clinic must not appear in a Manhattan search, at any position.
    """
    near = _record("1000000001")
    far = _record(
        "1000000002",
        org="DISTANT BILLING OFFICE LLC",
        city="LAKE MARY",
        state="FL",
        postal="327460000",
    )
    with _client([{"results": [near, far]}]) as client:
        providers = search_providers("10001", "urgent_care", client=client)

    assert [provider.npi for provider in providers] == ["1000000001"]


def test_widens_to_the_zip_prefix_when_the_exact_zip_is_thin():
    """A rural ZIP with one match should still fill the list from nearby."""
    exact = {"results": [_record("1000000001", postal="597180000")]}
    wider = {
        "results": [
            _record("1000000001", postal="597180000"),
            _record("1000000002", org="SYNTHETIC BOZEMAN CLINIC", postal="597150000"),
        ]
    }
    with _client([exact, wider]) as client:
        providers = search_providers("59718", "family_medicine", client=client)

    # The duplicate from the widened page is not listed twice.
    assert [provider.npi for provider in providers] == ["1000000001", "1000000002"]


def test_widens_on_the_providers_kept_not_the_records_returned():
    """
    The out-of-area records must not count towards "we have enough".

    This is the "ZIP search returns no providers" bug, in its exact shape.
    NPPES matches `postal_code` against every address on a record, including
    the secondary practice locations a telehealth clinician registers across
    the country, so a search for a real city ZIP comes back with a healthy-
    looking pile of records that are almost all doctors practising in other
    states. Counting those raw records made the search look well-stocked, so
    it skipped widening - and then dropped them, leaving the user with almost
    nothing. Observed live: downtown Hartford returned eight records and
    displayed two providers.
    """
    exact = {
        "results": [
            _record("1000000001", city="HARTFORD", state="CT", postal="061034500"),
            # Six clinicians whose practice address is elsewhere. Each is here
            # only because Hartford appears in a national list of locations.
            _record("1000000002", city="KATY", state="TX", postal="774942139"),
            _record("1000000003", city="CHARLESTON", state="WV", postal="253012234"),
            _record("1000000004", city="LOS ANGELES", state="CA", postal="900346060"),
            _record("1000000005", city="ORLANDO", state="FL", postal="328012381"),
            _record("1000000006", city="DENVER", state="CO", postal="802022449"),
            _record("1000000007", city="DETROIT", state="MI", postal="482431599"),
        ]
    }
    wider = {
        "results": [
            _record("1000000001", city="HARTFORD", state="CT", postal="061034500"),
            _record("1000000008", city="WEST HARTFORD", state="CT", postal="061190000"),
            _record("1000000009", city="NEWINGTON", state="CT", postal="061110000"),
        ]
    }
    with _client([exact, wider]) as client:
        providers = search_providers("06103", "family_medicine", client=client)

    # Seven records came back and only one was in the area, so the search had
    # to widen. Before the fix it did not, and this returned a single provider.
    assert [provider.npi for provider in providers] == [
        "1000000001",
        "1000000008",
        "1000000009",
    ]


def test_rejects_a_care_setting_outside_the_allowlist():
    """
    The care setting reaches a third party's query log, so it may only ever be
    a setting from the fixed list - never a free-text condition name.
    """
    with pytest.raises(ValueError):
        search_providers("10001", "oncology")


def test_rejects_a_malformed_postal_code():
    with pytest.raises(ValueError):
        search_providers("abc", "urgent_care")


def test_upstream_failure_raises_rather_than_returning_nothing():
    """
    An outage must be distinguishable from "no providers near you". Returning
    an empty list here would tell the user there is no urgent care nearby,
    which is a different and much worse statement.
    """

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ProviderDirectoryUnavailable):
            search_providers("10001", "urgent_care", client=client)


def test_the_request_carries_no_health_information():
    """
    The whole reason this vendor needs no BAA. Whatever else changes, the
    outbound query must never grow a field describing the user.
    """
    seen: list[httpx.QueryParams] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.params)
        return httpx.Response(200, json={"results": [_record("1000000001")]})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        search_providers("10001", "urgent_care", client=client)

    # A thin first page makes this widen to the ZIP prefix, so there is more
    # than one request. The property has to hold for every one of them.
    assert seen
    for params in seen:
        assert set(params.keys()) == {
            "version",
            "taxonomy_description",
            "address_purpose",
            "limit",
            "postal_code",
        }
        # Only the first five digits of the ZIP leave the app - and the
        # widened search sends fewer still.
        assert params["postal_code"] in {"10001", "100*"}


def test_zip_plus_four_is_truncated_before_it_leaves_the_app():
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.params["postal_code"])
        return httpx.Response(200, json={"results": [_record("1000000001")]})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        search_providers("10001-1810", "urgent_care", client=client)

    assert seen[0] == "10001"


def test_no_availability_is_ever_reported():
    """
    NPPES publishes no slots. `Provider` must not grow a field that a screen
    could render as "next available", because any value in it would be
    invented.
    """
    fields = set(provider_directory.Provider.__dataclass_fields__)
    for forbidden in ("next_available", "slots", "availability", "next_slot"):
        assert forbidden not in fields
