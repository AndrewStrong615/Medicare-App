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


class TestRoundCounting:
    def test_a_first_submission_has_been_asked_nothing(self):
        assert followup.rounds_completed(None) == 0

    def test_an_empty_object_still_counts_as_one_round(self):
        # Presence of the field is the signal. Reading `{}` as "not asked yet"
        # sent the client round the same questions again.
        assert followup.rounds_completed({}) == 1

    def test_round_one_answers_count_as_one_round(self):
        assert followup.rounds_completed({"location": "my lower back"}) == 1

    def test_any_round_two_id_proves_two_rounds(self):
        # Derived from the ids, never taken from the client: the cap on asking
        # is a safety property and must not be talkable-past.
        assert followup.rounds_completed({"location": "back", "onset": "Suddenly"}) == 2


class TestSecondRound:
    def test_round_two_never_repeats_a_round_one_question(self):
        asked = {q.question_id for q in followup.questions_for_round(2, {})}
        assert asked.isdisjoint({q.question_id for q in followup.QUESTIONS})

    def test_onset_and_course_are_always_asked(self):
        for answers in ({}, {"duration": "A few days"}, {"severity": "9"}):
            ids = [q.question_id for q in followup.questions_for_round(2, answers)]
            assert ids[:2] == ["onset", "course"]

    def test_selection_is_deterministic(self):
        # The same answers must always produce the same questions; a clinical
        # review cannot read a rule that varies.
        answers = {"duration": "A week or more", "severity": "4"}
        first = followup.questions_for_round(2, answers)
        assert all(followup.questions_for_round(2, answers) == first for _ in range(5))

    def test_the_third_question_follows_what_round_one_said(self):
        def third(answers):
            return followup.questions_for_round(2, answers)[2].question_id

        assert third({"severity": "9"}) == "impact"
        assert third({"duration": "Started today"}) == "pattern"
        assert third({"duration": "I'm not sure"}) == "pattern"
        assert third({"duration": "A week or more"}) == "prior"
        assert third({"duration": "A few days"}) == "recent"

    def test_every_round_two_question_is_renderable(self):
        for question in followup.ROUND_TWO_QUESTIONS:
            assert question.prompt.strip()
            assert question.kind in {"text", "choice"}
            if question.kind == "choice":
                assert question.choices

    def test_round_two_asks_nothing_a_clinician_would_ask(self):
        # The line this module must not cross. These questions elicit what the
        # person already knows about their own situation; they never test a
        # hypothesis or name a body system, a condition or a drug.
        forbidden = (
            "radiate", "blanch", "chest", "breath", "numb", "slur",
            "diabet", "cancer", "infection", "pressure", "heart",
        )
        for question in followup.ROUND_TWO_QUESTIONS:
            text = " ".join([question.prompt, question.helper, *question.choices]).lower()
            for term in forbidden:
                assert term not in text, f"{question.question_id} mentions {term!r}"


class TestWhenToStopAsking:
    def test_never_asks_past_the_cap(self):
        assert (
            followup.is_needed(
                rules_defaulted=True,
                red_flag_match=False,
                rounds_asked=followup.MAX_ROUNDS,
                answers={"onset": "Suddenly"},
            )
            is False
        )

    def test_a_red_flag_vetoes_every_round(self):
        for rounds in range(followup.MAX_ROUNDS + 1):
            assert (
                followup.is_needed(
                    rules_defaulted=True,
                    red_flag_match=True,
                    rounds_asked=rounds,
                    answers={"location": "my chest"},
                )
                is False
            )

    def test_asks_again_when_the_first_round_gave_something_usable(self):
        assert (
            followup.is_needed(
                rules_defaulted=True,
                red_flag_match=False,
                rounds_asked=1,
                answers={"location": "my lower back"},
            )
            is True
        )

    def test_does_not_ask_again_when_nothing_usable_came_back(self):
        # Someone who answered "not sure" to everything has told us they
        # cannot say more. Asking again would trap them.
        assert (
            followup.is_needed(
                rules_defaulted=True,
                red_flag_match=False,
                rounds_asked=1,
                answers={"location": "  ", "duration": "I'm not sure", "other": "no idea"},
            )
            is False
        )


class TestRecap:
    def test_nothing_to_recap_before_any_questions(self):
        assert followup.summarise(None).is_empty()
        assert followup.summarise({}).is_empty()

    def test_the_value_is_the_users_own_words_verbatim(self):
        recap = followup.summarise({"location": "  my lower back  "})
        assert followup.RecapEntry(label="Where", value="my lower back") in recap.understood

    def test_a_shrug_is_reported_as_unknown_not_as_a_fact(self):
        recap = followup.summarise({"location": "my back", "duration": "I'm not sure"})
        assert "How long" in recap.unclear
        assert all(entry.label != "How long" for entry in recap.understood)

    def test_unanswered_questions_are_listed_as_unclear(self):
        recap = followup.summarise({"location": "my back"})
        assert set(recap.unclear) == {"How long", "How bad, out of 10", "Alongside it"}

    def test_the_recap_covers_the_second_round_once_it_has_been_asked(self):
        recap = followup.summarise(
            {"location": "my back", "duration": "A few days", "onset": "Gradually"}
        )
        labels = [entry.label for entry in recap.understood]
        assert "How it started" in labels

    def test_the_recap_adds_no_words_of_its_own_beyond_the_labels(self):
        # The safety property: this is a receipt, not an interpretation. Every
        # value must appear verbatim in what the user submitted.
        answers = {
            "location": "my lower back",
            "duration": "A few days",
            "severity": "6",
            "other": "a bit of a headache",
        }
        recap = followup.summarise(answers)
        submitted = set(answers.values())
        assert all(entry.value in submitted for entry in recap.understood)

    def test_every_question_has_a_label(self):
        for question in followup.QUESTIONS + followup.ROUND_TWO_QUESTIONS:
            assert question.question_id in followup.RECAP_LABELS


class TestQuestionsAdaptToTheDescription:
    """
    Round one asks what is still missing, not the same four things every time.

    The value of not re-asking is not politeness: someone who has just been
    asked something they already said answers the rest less carefully, and the
    detail the classifier needed is what gets lost.
    """

    def _ids(self, description):
        return [q.question_id for q in followup.questions_for_round(1, None, description)]

    def test_a_description_that_says_nothing_is_asked_everything(self):
        assert self._ids("I feel awful") == ["location", "duration", "severity", "other"]

    def test_a_named_body_part_is_not_asked_for_again(self):
        assert "location" not in self._ids("my knee has been bothering me")

    def test_a_stated_duration_is_not_asked_for_again(self):
        assert "duration" not in self._ids("my throat has hurt since yesterday")
        assert "duration" not in self._ids("this has been going on for three days")

    def test_a_stated_intensity_is_not_asked_for_again(self):
        assert "severity" not in self._ids("a mild cough")
        assert "severity" not in self._ids("my head is 8/10")

    def test_several_at_once(self):
        assert self._ids("my lower back has hurt for three days and it is severe") == ["other"]

    def test_associated_symptoms_are_always_asked(self):
        # The one question whose answer cannot be inferred from what was
        # written, and the net that catches a symptom they did not mention.
        for description in (
            "my lower back has hurt for three days and it is severe",
            "mild ankle pain since yesterday",
            "",
        ):
            assert "other" in self._ids(description)

    def test_round_one_is_never_empty(self):
        assert self._ids("my lower back has hurt for three days and it is severe")

    def test_no_round_two_question_ever_appears_in_round_one(self):
        # `rounds_completed` reads the round off the answer keys, so the two
        # sets must stay disjoint or the server-side cap on asking can be
        # spent without counting.
        for description in ("", "my knee since yesterday, mild", "I feel awful"):
            ids = set(self._ids(description))
            assert not (ids & followup._ROUND_TWO_IDS)

    def test_omitting_the_description_reproduces_the_old_fixed_round(self):
        assert followup.questions_for_round(1) == followup.QUESTIONS

    def test_selection_is_deterministic(self):
        description = "my shoulder has ached for a week, fairly mild"
        assert self._ids(description) == self._ids(description)


class TestDescriptionDetectionIsConservative:
    """
    A missed detection costs one redundant question. A false detection loses
    information the classifier needed, so these must not over-fire.
    """

    def test_a_body_part_inside_a_longer_word_is_not_a_location(self):
        # A whole word is a place; "head" buried inside "headache" is a
        # symptom, so the person is still asked where they feel it.
        assert "location" in followup.answered_by_description("my knee hurts")
        assert "location" not in followup.answered_by_description("headache")

    def test_a_bare_number_is_not_a_severity(self):
        assert "severity" not in followup.answered_by_description("I took 2 tablets")

    def test_a_vague_time_reference_is_not_a_duration(self):
        assert "duration" not in followup.answered_by_description("it comes and goes")

    def test_an_empty_description_answers_nothing(self):
        assert followup.answered_by_description("") == frozenset()
        assert followup.answered_by_description("   ") == frozenset()
