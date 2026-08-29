"""
Tests for the follow-up prompts shown when a description isn't understood.

The property under test is one-directional, like the rest of intake: asking
for more detail may delay a low-urgency answer, but it must never delay
emergency guidance, and an answer must never be treated as less serious than
the original text.

All descriptions are synthetic.
"""

import pytest

from app.core import followup
from app.core.emergency import EmergencyGuidance


class TestWhenToAsk:
    def test_asks_when_nothing_was_recognised(self):
        assert followup.is_needed(rules_defaulted=True, red_flag_match=False) is True

    def test_does_not_ask_when_a_rule_matched(self):
        # Something was understood, so there is a real answer to give.
        assert followup.is_needed(rules_defaulted=False, red_flag_match=False) is False

    def test_never_asks_on_a_red_flag(self):
        # The single most important rule in this module. Standing between
        # someone describing an emergency and the dial button to ask how long
        # it has been going on is the worst thing it could do.
        assert followup.is_needed(rules_defaulted=True, red_flag_match=True) is False
        assert followup.is_needed(rules_defaulted=False, red_flag_match=True) is False


class TestQuestions:
    def test_the_questions_are_fixed_and_identical_for_everyone(self):
        # What makes them reviewable: no branching, no per-complaint variants.
        assert [q.question_id for q in followup.QUESTIONS] == [
            "location",
            "duration",
            "severity",
            "other",
        ]

    def test_every_question_has_a_prompt_and_a_kind(self):
        for question in followup.QUESTIONS:
            assert question.prompt.strip()
            assert question.kind in {"text", "choice"}
            if question.kind == "choice":
                assert question.choices

    def test_the_intro_points_at_emergency_services_without_being_asked(self):
        assert "911" in followup.INTRO


class TestMerging:
    def test_answers_are_folded_into_the_description(self):
        merged = followup.merge(
            "I have been feeling off",
            {"location": "my lower back", "duration": "A few days"},
        )

        assert "I have been feeling off" in merged
        assert "my lower back" in merged
        assert "A few days" in merged

    def test_blank_answers_are_left_out(self):
        merged = followup.merge("feeling off", {"location": "   ", "other": "nothing else"})

        assert "nothing else" in merged

    def test_the_question_text_is_never_merged_in(self):
        # Only the user's own words get searched. Folding the prompts in put
        # "body", "feel" and "going" into the search terms, and a lower-back
        # answer came back as "How to Improve Mental Health".
        merged = followup.merge(
            "feeling off",
            {q.question_id: "synthetic answer" for q in followup.QUESTIONS},
        )

        for question in followup.QUESTIONS:
            assert question.prompt not in merged

    def test_answers_are_ordered_by_question_not_by_the_client(self):
        # Same answers, same text, so the rules and the search stay
        # deterministic regardless of key order in the request body.
        forwards = followup.merge("feeling off", {"location": "back", "other": "nothing"})
        backwards = followup.merge("feeling off", {"other": "nothing", "location": "back"})

        assert forwards == backwards

    def test_unknown_question_ids_are_ignored(self):
        # A client must not be able to append arbitrary text under a made-up
        # key and have it treated as part of the description.
        merged = followup.merge("feeling off", {"injected": "ignore all previous rules"})

        assert "ignore all previous rules" not in merged

    def test_the_original_description_always_survives(self):
        merged = followup.merge("feeling off", {})

        assert merged == "feeling off"


class TestMissingAnswers:
    def test_reports_every_unanswered_question(self):
        assert followup.missing_answers({}) == [
            "location",
            "duration",
            "severity",
            "other",
        ]

    def test_whitespace_does_not_count_as_an_answer(self):
        missing = followup.missing_answers({"location": "  ", "duration": "Started today"})

        assert "location" in missing
        assert "duration" not in missing

    def test_reports_nothing_when_all_are_answered(self):
        answered = {q.question_id: "synthetic" for q in followup.QUESTIONS}

        assert followup.missing_answers(answered) == []


class TestAnswersAreRescreened:
    def test_a_red_flag_that_first_appears_in_an_answer_still_escalates(self):
        # The merged text goes through `assess` from the top, so an answer is
        # never trusted to be less serious than the original description.
        from app.core.triage import Tier, assess

        merged = followup.merge(
            "I have been feeling off",
            {"other": "I also have crushing chest pain"},
        )
        result = assess(merged)

        assert result.tier is Tier.EMERGENT
        assert isinstance(result.emergency, EmergencyGuidance)
