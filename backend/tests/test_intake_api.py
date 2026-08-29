"""
Tests for POST /intake/assess.

The triage call is patched in every test — no model calls, no network, all
descriptions synthetic.
"""

import pytest

from app.core.emergency import EmergencyGuidance
from app.core.triage import Tier, TriageResult, TriageUnavailable


def _result(
    tier=Tier.SELF_CARE,
    reasoning="Synthetic reasoning.",
    red_flag=False,
    emergency=None,
    model_tier=None,
    escalated=False,
):
    return TriageResult(
        tier=tier,
        reasoning=reasoning,
        red_flag_match=red_flag,
        emergency=emergency,
        model_tier=model_tier or tier,
        model_id="claude-opus-5",
        escalated_by_safety_net=escalated,
    )


@pytest.fixture()
def stub_triage(monkeypatch):
    def _set(result=None, error=False):
        def _fake(description: str):
            if error:
                raise TriageUnavailable("unavailable")
            return result or _result()

        monkeypatch.setattr("app.api.intake.assess", _fake)

    return _set


@pytest.fixture()
def stub_self_care(monkeypatch):
    """MedlinePlus lookup for self-care reading material."""

    async def _empty(term: str, *, limit: int = 10):
        return []

    monkeypatch.setattr("app.api.intake.search_topics", _empty)


class TestAuthentication:
    def test_assessment_requires_a_token(self, client, stub_triage, stub_self_care):
        stub_triage()

        response = client.post("/intake/assess", json={"description": "sore throat"})

        assert response.status_code == 401


class TestSafetyCopy:
    def test_every_response_carries_the_not_a_diagnosis_disclaimer(
        self, client, auth_headers, stub_triage, stub_self_care
    ):
        stub_triage()

        body = client.post(
            "/intake/assess", json={"description": "sore throat"}, headers=auth_headers
        ).json()

        disclaimer = body["disclaimer"].lower()
        assert "not a diagnosis" in disclaimer
        # It must also say the tier is a suggestion the user can override.
        assert "suggestion, not a determination" in disclaimer

    def test_every_response_carries_an_escalation_path(
        self, client, auth_headers, stub_triage, stub_self_care
    ):
        stub_triage()

        body = client.post(
            "/intake/assess", json={"description": "sore throat"}, headers=auth_headers
        ).json()

        assert "911" in body["escalation_guidance"]

    @pytest.mark.parametrize("tier", [Tier.SELF_CARE, Tier.URGENT, Tier.EMERGENT])
    def test_safety_copy_is_present_for_every_tier(
        self, client, auth_headers, stub_triage, stub_self_care, tier
    ):
        stub_triage(_result(tier=tier))

        body = client.post(
            "/intake/assess", json={"description": "synthetic"}, headers=auth_headers
        ).json()

        assert body["disclaimer"]
        assert body["escalation_guidance"]


class TestTiers:
    def test_emergent_returns_emergency_guidance(
        self, client, auth_headers, stub_triage, stub_self_care
    ):
        stub_triage(
            _result(
                tier=Tier.EMERGENT,
                red_flag=True,
                emergency=EmergencyGuidance(
                    category="cardiac",
                    headline="If you have chest pain, call 911 now.",
                    action="Call 911 right away.",
                    matched_terms=["chest pain"],
                ),
            )
        )

        body = client.post(
            "/intake/assess", json={"description": "chest pain"}, headers=auth_headers
        ).json()

        assert body["tier"] == "EMERGENT"
        assert body["emergency"]["category"] == "cardiac"
        assert body["red_flag_match"] is True

    def test_self_care_includes_sourced_reading_material(
        self, client, auth_headers, stub_triage, monkeypatch
    ):
        from app.services.medlineplus import SymptomTopic

        async def _topics(term: str, *, limit: int = 10):
            return [
                SymptomTopic(
                    topic_id="sorethroat",
                    title="Sore Throat",
                    summary="Synthetic summary.",
                    url="https://medlineplus.gov/sorethroat.html",
                    source_name="MedlinePlus, US National Library of Medicine",
                    groups=["Symptoms"],
                )
            ]

        monkeypatch.setattr("app.api.intake.search_topics", _topics)
        stub_triage(_result(tier=Tier.SELF_CARE))

        body = client.post(
            "/intake/assess", json={"description": "sore throat"}, headers=auth_headers
        ).json()

        assert len(body["self_care_topics"]) == 1
        # Content must be attributed, proving it is not model-written.
        assert "National Library of Medicine" in body["self_care_topics"][0]["source_name"]
        assert "MedlinePlus" in body["self_care_source_note"]

    def test_urgent_carries_no_self_care_topics(
        self, client, auth_headers, stub_triage, stub_self_care
    ):
        stub_triage(_result(tier=Tier.URGENT))

        body = client.post(
            "/intake/assess", json={"description": "synthetic"}, headers=auth_headers
        ).json()

        assert body["self_care_topics"] == []

    def test_self_care_still_returns_when_the_content_source_is_down(
        self, client, auth_headers, stub_triage, stub_self_care
    ):
        # An article outage must not cost the user their tier and escalation path.
        stub_triage(_result(tier=Tier.SELF_CARE))

        response = client.post(
            "/intake/assess", json={"description": "sore throat"}, headers=auth_headers
        )

        assert response.status_code == 201
        assert response.json()["self_care_topics"] == []


class TestFailureMode:
    def test_triage_failure_is_a_503_not_a_reassuring_tier(
        self, client, auth_headers, stub_triage, stub_self_care
    ):
        stub_triage(error=True)

        response = client.post(
            "/intake/assess", json={"description": "sore throat"}, headers=auth_headers
        )

        assert response.status_code == 503
        detail = response.json()["detail"].lower()
        # Must not imply the user is fine, and must point at real care.
        assert "911" in detail
        assert "couldn't assess" in detail

    def test_missing_credentials_are_diagnosable_outside_production(
        self, client, auth_headers, stub_self_care, monkeypatch
    ):
        from app.core.triage import TriageNotConfigured

        def _unconfigured(description: str):
            raise TriageNotConfigured("no credentials")

        monkeypatch.setattr("app.api.intake.assess", _unconfigured)
        monkeypatch.setattr("app.api.intake.settings.environment", "local")

        response = client.post(
            "/intake/assess", json={"description": "sore throat"}, headers=auth_headers
        )

        assert response.status_code == 503
        detail = response.json()["detail"]
        # A developer must be able to tell misconfiguration from an outage.
        assert "ANTHROPIC_API_KEY" in detail
        # And the user-facing safety guidance is still there.
        assert "911" in detail

    def test_production_never_leaks_configuration_details(
        self, client, auth_headers, stub_self_care, monkeypatch
    ):
        from app.core.triage import TriageNotConfigured

        def _unconfigured(description: str):
            raise TriageNotConfigured("no credentials")

        monkeypatch.setattr("app.api.intake.assess", _unconfigured)
        monkeypatch.setattr("app.api.intake.settings.environment", "production")

        response = client.post(
            "/intake/assess", json={"description": "sore throat"}, headers=auth_headers
        )

        detail = response.json()["detail"]
        assert "ANTHROPIC_API_KEY" not in detail
        assert "911" in detail

    def test_a_red_flag_still_works_with_no_credentials(
        self, client, auth_headers, stub_self_care
    ):
        # The whole point of the deterministic layer: emergency screening must
        # not depend on the classifier being configured at all.
        response = client.post(
            "/intake/assess",
            json={"description": "I have crushing chest pain"},
            headers=auth_headers,
        )

        assert response.status_code == 201
        body = response.json()
        assert body["tier"] == "EMERGENT"
        assert body["red_flag_match"] is True


class TestAuditTrail:
    def test_nothing_is_stored_without_consent(
        self, client, auth_headers, stub_triage, stub_self_care
    ):
        stub_triage()

        body = client.post(
            "/intake/assess",
            json={"description": "sore throat", "consent_to_store": False},
            headers=auth_headers,
        ).json()

        assert body["id"] is None

    def test_consent_defaults_to_false_when_the_field_is_omitted(
        self, client, auth_headers, stub_triage, stub_self_care
    ):
        stub_triage()

        body = client.post(
            "/intake/assess", json={"description": "sore throat"}, headers=auth_headers
        ).json()

        assert body["id"] is None

    def test_with_consent_the_assessment_is_recorded_for_review(
        self, client, auth_headers, stub_triage, stub_self_care, db_session
    ):
        from app.models.intake import IntakeAssessment

        stub_triage(
            _result(tier=Tier.EMERGENT, red_flag=True, model_tier=Tier.SELF_CARE, escalated=True)
        )

        body = client.post(
            "/intake/assess",
            json={"description": "chest pain", "consent_to_store": True},
            headers=auth_headers,
        ).json()

        assert body["id"]
        record = db_session.query(IntakeAssessment).filter_by(id=body["id"]).one()
        assert record.description == "chest pain"
        assert record.tier == "EMERGENT"
        # The model's own answer is kept separately so reviewers can measure
        # how often the safety net had to override it.
        assert record.model_tier == "SELF_CARE"
        assert record.escalated_by_safety_net is True
        assert record.consented_to_logging is True

    def test_a_user_can_report_a_tier_as_wrong(
        self, client, auth_headers, stub_triage, stub_self_care, db_session
    ):
        from app.models.intake import IntakeAssessment

        stub_triage()
        created = client.post(
            "/intake/assess",
            json={"description": "sore throat", "consent_to_store": True},
            headers=auth_headers,
        ).json()

        response = client.post(
            f"/intake/{created['id']}/feedback",
            json={"reported_wrong": True},
            headers=auth_headers,
        )

        assert response.status_code == 204
        record = db_session.query(IntakeAssessment).filter_by(id=created["id"]).one()
        assert record.user_reported_wrong is True

    def test_one_user_cannot_report_on_anothers_assessment(
        self, client, auth_headers, other_user_headers, stub_triage, stub_self_care
    ):
        stub_triage()
        created = client.post(
            "/intake/assess",
            json={"description": "sore throat", "consent_to_store": True},
            headers=auth_headers,
        ).json()

        response = client.post(
            f"/intake/{created['id']}/feedback",
            json={"reported_wrong": True},
            headers=other_user_headers,
        )

        assert response.status_code == 404


class TestValidation:
    @pytest.mark.parametrize("description", ["", "   " * 0])
    def test_empty_description_is_rejected(
        self, client, auth_headers, stub_triage, stub_self_care, description
    ):
        stub_triage()

        response = client.post(
            "/intake/assess", json={"description": description}, headers=auth_headers
        )

        assert response.status_code == 422

    def test_the_description_is_not_echoed_in_validation_errors(
        self, client, auth_headers, stub_triage, stub_self_care
    ):
        stub_triage()
        sensitive = "z" * 2001

        response = client.post(
            "/intake/assess", json={"description": sensitive}, headers=auth_headers
        )

        assert response.status_code == 422
        assert sensitive not in response.text
