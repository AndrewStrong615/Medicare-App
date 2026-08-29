"""
Tests for GET /symptoms/search.

The MedlinePlus client is patched in every test — the suite makes no network
calls, and all topic text below is synthetic.
"""

import pytest

from app.services.medlineplus import MedlinePlusUnavailable, SymptomTopic

SYNTHETIC_TOPIC = SymptomTopic(
    topic_id="testtopic",
    title="Test Topic",
    summary="General information about a made-up topic.",
    url="https://medlineplus.gov/testtopic.html",
    source_name="MedlinePlus, US National Library of Medicine",
    groups=["Symptoms"],
)


@pytest.fixture()
def stub_search(monkeypatch):
    """Replace the upstream call; returns a setter for the desired behaviour."""

    def _set(topics=None, error: Exception | None = None):
        async def _fake_search(term: str, *, limit: int = 10):
            if error:
                raise error
            return topics if topics is not None else []

        # Patched where it is used, not where it is defined.
        monkeypatch.setattr("app.api.symptoms.search_topics", _fake_search)

    return _set


def test_search_returns_topics_from_the_source(client, stub_search):
    stub_search(topics=[SYNTHETIC_TOPIC])

    response = client.get("/symptoms/search", params={"q": "test topic"})

    assert response.status_code == 200
    body = response.json()
    assert body["query"] == "test topic"
    assert len(body["results"]) == 1
    assert body["results"][0]["title"] == "Test Topic"


def test_every_response_carries_a_disclaimer_and_care_guidance(client, stub_search):
    stub_search(topics=[SYNTHETIC_TOPIC])

    body = client.get("/symptoms/search", params={"q": "test topic"}).json()

    # Required on every result screen by CLAUDE.md.
    assert "not medical advice" in body["disclaimer"].lower()
    assert "not a diagnosis" in body["disclaimer"].lower()
    assert "911" in body["care_guidance"]


def test_results_credit_the_source(client, stub_search):
    stub_search(topics=[SYNTHETIC_TOPIC])

    body = client.get("/symptoms/search", params={"q": "test topic"}).json()

    assert "National Library of Medicine" in body["results"][0]["source_name"]
    assert body["results"][0]["url"].startswith("https://")


def test_ordinary_search_has_no_emergency_guidance(client, stub_search):
    stub_search(topics=[SYNTHETIC_TOPIC])

    body = client.get("/symptoms/search", params={"q": "sore throat"}).json()

    assert body["emergency"] is None


def test_emergency_query_returns_guidance_alongside_results(client, stub_search):
    stub_search(topics=[SYNTHETIC_TOPIC])

    body = client.get("/symptoms/search", params={"q": "chest pain"}).json()

    assert body["emergency"] is not None
    assert body["emergency"]["category"] == "cardiac"
    assert "911" in body["emergency"]["action"]
    # Guidance supplements the results rather than replacing them.
    assert len(body["results"]) == 1


def test_emergency_guidance_is_returned_even_when_the_source_is_down(client, stub_search):
    # Losing the content library must never cost someone the instruction to
    # call 911.
    stub_search(error=MedlinePlusUnavailable("down"))

    response = client.get("/symptoms/search", params={"q": "chest pain"})

    assert response.status_code == 200
    body = response.json()
    assert body["emergency"]["category"] == "cardiac"
    assert body["results"] == []
    assert "not medical advice" in body["disclaimer"].lower()


def test_source_outage_on_an_ordinary_search_explains_what_to_do(client, stub_search):
    stub_search(error=MedlinePlusUnavailable("down"))

    response = client.get("/symptoms/search", params={"q": "sore throat"})

    assert response.status_code == 503
    detail = response.json()["detail"]
    assert "try again" in detail.lower()


def test_no_results_still_returns_disclaimer_and_guidance(client, stub_search):
    stub_search(topics=[])

    body = client.get("/symptoms/search", params={"q": "zzzznotarealterm"}).json()

    assert body["results"] == []
    assert body["disclaimer"]
    assert body["care_guidance"]


@pytest.mark.parametrize("query", ["", "   "])
def test_blank_queries_are_rejected(client, stub_search, query):
    stub_search(topics=[])

    response = client.get("/symptoms/search", params={"q": query})

    assert response.status_code == 422


def test_overlong_query_is_rejected(client, stub_search):
    stub_search(topics=[])

    response = client.get("/symptoms/search", params={"q": "a" * 201})

    assert response.status_code == 422
