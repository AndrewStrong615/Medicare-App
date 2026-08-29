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
    rules_defaulted=False,
):
    return TriageResult(
        tier=tier,
        reasoning=reasoning,
        red_flag_match=red_flag,
        emergency=emergency,
        model_tier=model_tier or tier,
        model_id="claude-opus-5",
        escalated_by_safety_net=escalated,
        rule_tier=tier,
        rules_defaulted=rules_defaulted,
    )


@pytest.fixture()
def stub_triage(monkeypatch):
    def _set(result=None, error=False):
        def _fake(description: str, *, followup_already_asked: bool = False):
            if error:
                raise TriageUnavailable("unavailable")
            return result or _result()

        monkeypatch.setattr("app.api.intake.assess", _fake)

    return _set


@pytest.fixture()
def stub_topics(monkeypatch):
    """MedlinePlus lookup for the related-reading section."""

    async def _empty(term: str, *, limit: int = 10):
        return []

    monkeypatch.setattr("app.api.intake.search_topics", _empty)


class TestAuthentication:
    def test_assessment_requires_a_token(self, client, stub_triage, stub_topics):
        stub_triage()

        response = client.post("/intake/assess", json={"description": "sore throat"})

        assert response.status_code == 401


class TestSafetyCopy:
    def test_every_response_carries_the_not_a_diagnosis_disclaimer(
        self, client, auth_headers, stub_triage, stub_topics
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
        self, client, auth_headers, stub_triage, stub_topics
    ):
        stub_triage()

        body = client.post(
            "/intake/assess", json={"description": "sore throat"}, headers=auth_headers
        ).json()

        assert "911" in body["escalation_guidance"]

    @pytest.mark.parametrize("tier", [Tier.SELF_CARE, Tier.URGENT, Tier.EMERGENT])
    def test_safety_copy_is_present_for_every_tier(
        self, client, auth_headers, stub_triage, stub_topics, tier
    ):
        stub_triage(_result(tier=tier))

        body = client.post(
            "/intake/assess", json={"description": "synthetic"}, headers=auth_headers
        ).json()

        assert body["disclaimer"]
        assert body["escalation_guidance"]


class TestTiers:
    def test_emergent_returns_emergency_guidance(
        self, client, auth_headers, stub_triage, stub_topics
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

    @pytest.fixture()
    def stub_one_topic(self, monkeypatch):
        """One synthetic MedlinePlus hit, and the queries it was asked for."""
        from app.services.medlineplus import SymptomTopic

        asked: list[str] = []

        async def _topics(term: str, *, limit: int = 10):
            asked.append(term)
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
        return asked

    @pytest.fixture()
    def topics_enabled(self, monkeypatch):
        """
        Turn the reading-material feature on for a test.

        It ships OFF: topic selection is lexical, so a topic sharing one word
        with the description can be unrelated and alarming, and that is
        awaiting a clinician's decision. The tests below describe how it
        behaves when it is switched back on.
        """
        monkeypatch.setattr("app.api.intake.settings.medlineplus_topics_enabled", True)

    @pytest.mark.parametrize("tier", [Tier.SELF_CARE, Tier.URGENT])
    def test_no_reading_material_is_shown_while_the_feature_is_gated(
        self, client, auth_headers, stub_triage, stub_one_topic, tier
    ):
        # The default. Nothing is fetched, so nothing reaches NLM either.
        stub_triage(_result(tier=tier))

        body = client.post(
            "/intake/assess", json={"description": "sore throat"}, headers=auth_headers
        ).json()

        assert body["related_topics"] == []
        assert body["topics_disabled"] is True
        # The lookup was never attempted — no symptom text left the app.
        assert stub_one_topic == []

    @pytest.mark.parametrize("tier", [Tier.SELF_CARE, Tier.URGENT])
    def test_actionable_tiers_carry_sourced_reading_material(
        self, client, auth_headers, stub_triage, stub_one_topic, topics_enabled, tier
    ):
        # The point of the feature: a tier on its own is not an answer. Every
        # tier the user can act on at their own pace arrives with something
        # to actually read.
        stub_triage(_result(tier=tier))

        body = client.post(
            "/intake/assess", json={"description": "sore throat"}, headers=auth_headers
        ).json()

        assert len(body["related_topics"]) == 1
        # Content must be attributed, proving it is not model-written.
        assert "National Library of Medicine" in body["related_topics"][0]["source_name"]
        assert "MedlinePlus" in body["topics_source_note"]

    def test_conversational_text_is_reduced_before_it_is_searched(
        self, client, auth_headers, stub_triage, stub_one_topic, topics_enabled
    ):
        # Searching the raw sentence is what used to return nothing.
        stub_triage(_result(tier=Tier.URGENT))

        client.post(
            "/intake/assess",
            json={"description": "I have really been feeling a sore throat since yesterday"},
            headers=auth_headers,
        )

        assert stub_one_topic == ["sore throat"]

    def test_topics_unrelated_to_the_users_words_are_not_shown(
        self, client, auth_headers, stub_triage, monkeypatch, topics_enabled
    ):
        # The live source answers "swollen ankle" with "Diabetic Heart
        # Disease" ranked above anything about ankles. Printed under someone's
        # description that reads as a suggested diagnosis, so it is dropped
        # and the search broadens instead.
        from app.services.medlineplus import SymptomTopic

        def _topic(topic_id, title):
            return SymptomTopic(
                topic_id=topic_id,
                title=title,
                summary="Synthetic summary.",
                url=f"https://medlineplus.gov/{topic_id}.html",
                source_name="MedlinePlus, US National Library of Medicine",
                groups=[],
            )

        async def _topics(term: str, *, limit: int = 10):
            if term == "swollen ankle":
                return [_topic("diabetic", "Diabetic Heart Disease"), _topic("edema", "Edema")]
            return [_topic("ankleinjuries", "Ankle Injuries and Disorders")]

        monkeypatch.setattr("app.api.intake.search_topics", _topics)
        stub_triage(_result(tier=Tier.URGENT))

        body = client.post(
            "/intake/assess", json={"description": "swollen ankle"}, headers=auth_headers
        ).json()

        titles = [topic["title"] for topic in body["related_topics"]]
        assert titles == ["Ankle Injuries and Disorders"]

    def test_emergent_does_not_wait_on_a_content_lookup(
        self, client, auth_headers, stub_triage, stub_one_topic, topics_enabled
    ):
        # The emergency screen's only job is "call 911 now". It must not be
        # held up by an article fetch, so the lookup is never made.
        stub_triage(_result(tier=Tier.EMERGENT, red_flag=True))

        body = client.post(
            "/intake/assess", json={"description": "synthetic"}, headers=auth_headers
        ).json()

        assert stub_one_topic == []
        assert body["related_topics"] == []

    def test_self_care_still_returns_when_the_content_source_is_down(
        self, client, auth_headers, stub_triage, stub_topics, topics_enabled
    ):
        # An article outage must not cost the user their tier and escalation path.
        stub_triage(_result(tier=Tier.SELF_CARE))

        response = client.post(
            "/intake/assess", json={"description": "sore throat"}, headers=auth_headers
        )

        assert response.status_code == 201
        assert response.json()["related_topics"] == []


class TestFollowUpQuestions:
    def test_an_unrecognised_description_is_asked_for_more_detail(
        self, client, auth_headers, stub_triage, stub_topics
    ):
        stub_triage(_result(tier=Tier.URGENT, rules_defaulted=True))

        response = client.post(
            "/intake/assess",
            json={"description": "I have been feeling off"},
            headers=auth_headers,
        )
        body = response.json()

        assert response.status_code == 200
        assert body["status"] == "needs_detail"
        assert [q["question_id"] for q in body["questions"]] == [
            "location",
            "duration",
            "severity",
            "other",
        ]
        # No tier at all — not even a provisional one to act on.
        assert "tier" not in body

    def test_a_red_flag_is_never_held_behind_questions(
        self, client, auth_headers, stub_triage, stub_topics
    ):
        # Even though the rules recognised nothing else, an emergency gets its
        # guidance immediately.
        emergency = EmergencyGuidance(
            category="cardiac",
            headline="Call 911 now.",
            action="Call 911 or your local emergency number.",
            matched_terms=["chest pain"],
        )
        stub_triage(
            _result(
                tier=Tier.EMERGENT,
                red_flag=True,
                emergency=emergency,
                rules_defaulted=True,
            )
        )

        response = client.post(
            "/intake/assess",
            json={"description": "synthetic red flag"},
            headers=auth_headers,
        )
        body = response.json()

        assert response.status_code == 201
        assert body["status"] == "assessed"
        assert body["tier"] == "EMERGENT"
        assert body["emergency"]["category"] == "cardiac"

    def test_a_recognised_description_is_not_asked_anything(
        self, client, auth_headers, stub_triage, stub_topics
    ):
        stub_triage(_result(tier=Tier.URGENT, rules_defaulted=False))

        response = client.post(
            "/intake/assess", json={"description": "I think I broke my wrist"}, headers=auth_headers
        )

        assert response.status_code == 201
        assert response.json()["status"] == "assessed"

    def test_answers_produce_an_assessment_rather_than_more_questions(
        self, client, auth_headers, stub_triage, stub_topics
    ):
        # Asking twice would trap the user in a loop.
        stub_triage(_result(tier=Tier.URGENT, rules_defaulted=True))

        response = client.post(
            "/intake/assess",
            json={
                "description": "I have been feeling off",
                "follow_up_answers": {"location": "my lower back", "duration": "A few days"},
            },
            headers=auth_headers,
        )

        assert response.status_code == 201
        assert response.json()["status"] == "assessed"

    def test_an_empty_answers_object_still_counts_as_having_been_asked(
        self, client, auth_headers, stub_triage, stub_topics
    ):
        # Presence of the field, not its truthiness, marks the second
        # submission. Reading `{}` as "not asked yet" sent the client round the
        # same questions again.
        stub_triage(_result(tier=Tier.URGENT, rules_defaulted=True))

        response = client.post(
            "/intake/assess",
            json={"description": "I have been feeling off", "follow_up_answers": {}},
            headers=auth_headers,
        )

        assert response.status_code == 201
        assert response.json()["status"] == "assessed"

    def test_the_answers_are_assessed_not_just_the_original_description(
        self, client, auth_headers, stub_topics, monkeypatch
    ):
        seen: list[str] = []

        def _capture(description: str, *, followup_already_asked: bool = False):
            seen.append(description)
            return _result(tier=Tier.URGENT, rules_defaulted=False)

        monkeypatch.setattr("app.api.intake.assess", _capture)

        client.post(
            "/intake/assess",
            json={
                "description": "I have been feeling off",
                "follow_up_answers": {"location": "my lower back"},
            },
            headers=auth_headers,
        )

        assert "my lower back" in seen[0]

    def test_what_is_stored_is_the_text_that_was_assessed(
        self, client, auth_headers, stub_triage, stub_topics, db_session
    ):
        # The audit trail has to show the description the tier was based on,
        # not the half of it the user typed first.
        from app.models.intake import IntakeAssessment

        stub_triage(_result(tier=Tier.URGENT, rules_defaulted=False))

        client.post(
            "/intake/assess",
            json={
                "description": "I have been feeling off",
                "follow_up_answers": {"location": "my lower back"},
                "consent_to_store": True,
            },
            headers=auth_headers,
        )

        record = db_session.query(IntakeAssessment).one()
        assert "my lower back" in record.description


class TestFailureMode:
    def test_triage_failure_is_a_503_not_a_reassuring_tier(
        self, client, auth_headers, stub_triage, stub_topics
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
        self, client, auth_headers, stub_topics, monkeypatch
    ):
        from app.core.triage import TriageNotConfigured

        def _unconfigured(description: str, *, followup_already_asked: bool = False):
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
        self, client, auth_headers, stub_topics, monkeypatch
    ):
        from app.core.triage import TriageNotConfigured

        def _unconfigured(description: str, *, followup_already_asked: bool = False):
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
        self, client, auth_headers, stub_topics
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
        self, client, auth_headers, stub_triage, stub_topics
    ):
        stub_triage()

        body = client.post(
            "/intake/assess",
            json={"description": "sore throat", "consent_to_store": False},
            headers=auth_headers,
        ).json()

        assert body["id"] is None

    def test_consent_defaults_to_false_when_the_field_is_omitted(
        self, client, auth_headers, stub_triage, stub_topics
    ):
        stub_triage()

        body = client.post(
            "/intake/assess", json={"description": "sore throat"}, headers=auth_headers
        ).json()

        assert body["id"] is None

    def test_with_consent_the_assessment_is_recorded_for_review(
        self, client, auth_headers, stub_triage, stub_topics, db_session
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
        self, client, auth_headers, stub_triage, stub_topics, db_session
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
        self, client, auth_headers, other_user_headers, stub_triage, stub_topics
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
        self, client, auth_headers, stub_triage, stub_topics, description
    ):
        stub_triage()

        response = client.post(
            "/intake/assess", json={"description": description}, headers=auth_headers
        )

        assert response.status_code == 422

    def test_the_description_is_not_echoed_in_validation_errors(
        self, client, auth_headers, stub_triage, stub_topics
    ):
        stub_triage()
        sensitive = "z" * 2001

        response = client.post(
            "/intake/assess", json={"description": sensitive}, headers=auth_headers
        )

        assert response.status_code == 422
        assert sensitive not in response.text
