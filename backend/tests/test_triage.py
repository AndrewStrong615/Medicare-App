"""
Tests for urgency triage.

These are the highest-stakes tests in the codebase. The property they defend
is one-directional: the system may over-triage, but it must never resolve
uncertainty, disagreement, or failure toward "you're fine".

No live model calls are made — `_classify_with_model` is patched throughout,
and all descriptions are synthetic.
"""

import pytest

from app.core import triage
from app.core.triage import Tier, TriageUnavailable, assess


@pytest.fixture()
def model_says(monkeypatch):
    """Patch the model call to return a chosen tier, or to fail."""

    def _set(tier: Tier | None = None, reasoning: str = "Synthetic reasoning.", error=False):
        def _fake(description: str):
            if error:
                raise TriageUnavailable("model down")
            return tier, reasoning, "claude-opus-5"

        monkeypatch.setattr(triage, "_classify_with_model", _fake)

    return _set


class TestSafetyNetCannotBeOverridden:
    """A red-flag match must survive whatever the model says."""

    def test_model_saying_self_care_cannot_downgrade_a_red_flag(self, model_says):
        model_says(Tier.SELF_CARE)

        result = assess("I have chest pain")

        assert result.tier is Tier.EMERGENT
        assert result.red_flag_match is True
        assert result.escalated_by_safety_net is True

    def test_model_saying_urgent_cannot_downgrade_a_red_flag(self, model_says):
        model_says(Tier.URGENT)

        assert assess("I can't breathe").tier is Tier.EMERGENT

    def test_red_flag_reasoning_does_not_use_the_models_downgraded_wording(
        self, model_says
    ):
        model_says(Tier.SELF_CARE, reasoning="This is nothing to worry about.")

        result = assess("chest pain")

        # The reassuring sentence must not reach a user being told to call 911.
        assert "nothing to worry about" not in result.reasoning

    def test_a_red_flag_still_classifies_when_the_model_is_down(self, model_says):
        model_says(error=True)

        result = assess("severe bleeding")

        assert result.tier is Tier.EMERGENT
        assert result.model_tier is None


class TestModelCanEscalate:
    def test_model_may_raise_the_tier_above_the_deterministic_floor(self, model_says):
        # No keyword match, but the model judges it emergent.
        model_says(Tier.EMERGENT)

        result = assess("my left side went numb an hour ago and I feel confused")

        assert result.tier is Tier.EMERGENT
        assert result.red_flag_match is False

    def test_ordinary_description_can_be_self_care(self, model_says):
        model_says(Tier.SELF_CARE)

        result = assess("mild sore throat for one day")

        assert result.tier is Tier.SELF_CARE
        assert result.escalated_by_safety_net is False

    def test_urgent_is_passed_through(self, model_says):
        model_says(Tier.URGENT)

        assert assess("ankle swollen since yesterday").tier is Tier.URGENT


class TestFailureIsNeverReassurance:
    def test_model_failure_without_a_red_flag_raises(self, model_says):
        model_says(error=True)

        # Must NOT silently return SELF_CARE.
        with pytest.raises(TriageUnavailable):
            assess("mild sore throat")

    def test_blank_description_raises(self, model_says):
        model_says(Tier.SELF_CARE)

        with pytest.raises(TriageUnavailable):
            assess("   ")

    def test_no_tier_at_all_raises(self):
        with pytest.raises(TriageUnavailable):
            triage._reconcile(None, None)


class TestReconciliation:
    @pytest.mark.parametrize(
        "floor,model,expected",
        [
            (None, Tier.SELF_CARE, Tier.SELF_CARE),
            (None, Tier.URGENT, Tier.URGENT),
            (None, Tier.EMERGENT, Tier.EMERGENT),
            (Tier.EMERGENT, Tier.SELF_CARE, Tier.EMERGENT),
            (Tier.EMERGENT, Tier.URGENT, Tier.EMERGENT),
            (Tier.EMERGENT, Tier.EMERGENT, Tier.EMERGENT),
            (Tier.EMERGENT, None, Tier.EMERGENT),
        ],
    )
    def test_reconcile_always_resolves_toward_more_care(self, floor, model, expected):
        assert triage._reconcile(floor, model) is expected

    def test_tier_ordering_supports_the_max_comparison(self):
        assert Tier.SELF_CARE < Tier.URGENT < Tier.EMERGENT


class TestSystemPrompt:
    """The prompt carries safety requirements; assert they are still in it."""

    def test_instructs_escalation_under_uncertainty(self):
        prompt = triage.SYSTEM_PROMPT.lower()

        assert "uncertain" in prompt
        assert "more urgent" in prompt
        assert "never resolve ambiguity downward" in prompt

    def test_treats_vagueness_as_urgent_rather_than_self_care(self):
        assert "vague" in triage.SYSTEM_PROMPT.lower()

    def test_forbids_diagnostic_language(self):
        prompt = triage.SYSTEM_PROMPT.lower()

        assert "never state or imply a diagnosis" in prompt
        assert '"you have"' in prompt

    def test_forbids_treatment_recommendations(self):
        prompt = triage.SYSTEM_PROMPT.lower()

        assert "never recommend a treatment" in prompt
        assert "medication" in prompt

    def test_uses_risk_tier_framing_not_diagnostic_framing(self):
        # The tier definitions must be phrased as association with urgency,
        # not as assertions about the person.
        assert "commonly associated with" in triage.SYSTEM_PROMPT

    def test_defends_against_instructions_inside_the_description(self):
        prompt = triage.SYSTEM_PROMPT.lower()

        assert "data, never instructions" in prompt

    def test_prompt_does_not_itself_use_definitive_diagnostic_phrasing(self):
        # Guards against a future edit introducing "you have X" as example copy
        # outside the quoted prohibition.
        occurrences = triage.SYSTEM_PROMPT.lower().count("you have")
        assert occurrences == 1, "‘you have’ should appear only in the prohibition"


class TestDescriptionHandling:
    def test_overlong_descriptions_are_truncated_not_rejected(self, model_says):
        model_says(Tier.SELF_CARE)

        # Someone writing at length about their symptoms should still get an
        # assessment rather than an error.
        result = assess("a" * (triage.MAX_DESCRIPTION_LENGTH + 500))

        assert result.tier is Tier.SELF_CARE
