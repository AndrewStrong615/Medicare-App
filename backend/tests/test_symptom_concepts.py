"""
Tests for concept-level red-flag matching.

These guard two different things, and the second matters more than the first:

1. That the combinations fire — a stiff neck and a fever written as two
   separate clauses now reaches EMERGENT.
2. That adding them changed nothing else. The combinator is only safe because
   it runs after every literal phrase and can turn a `None` into guidance and
   nothing else. Several tests below exist to make a regression in that
   property a failing suite rather than a quiet change of behaviour.
"""

import pytest

from app.core import rules_triage, symptom_concepts
from app.core.emergency import _EMERGENCY_RULES, screen_for_emergency


# ---------------------------------------------------------------------------
# The combinations fire, in orders and phrasings a phrase list cannot hold.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "description",
    [
        # The case emergency.py recorded against itself as a known limit.
        "my neck is stiff and I have a fever",
        # Reverse order.
        "I have a fever and my neck has gone stiff",
        # Distance between the two concepts.
        "I woke up with a fever, took some paracetamol, and now my neck is stiff",
        # Lay synonyms on both halves.
        "burning up and I can't turn my neck",
        "neck stiffness with a raised temperature",
    ],
)
def test_stiff_neck_with_fever_is_detected(description):
    guidance = screen_for_emergency(description)

    assert guidance is not None, f"no emergency guidance for {description!r}"
    assert guidance.category == "sepsis_meningitis"
    assert guidance.matched_terms


@pytest.mark.parametrize(
    "description",
    [
        "I have a rash and it doesnt fade when I press it",
        "I have a rash and it doesn't fade when I press it",
        "purple spots that dont fade",
        "blotches on my legs, they stay when I press a glass on them",
    ],
)
def test_non_fading_rash_is_detected(description):
    guidance = screen_for_emergency(description)

    assert guidance is not None, f"no emergency guidance for {description!r}"
    assert guidance.category == "sepsis_meningitis"


@pytest.mark.parametrize(
    "description",
    [
        "he is confused and has a really high temperature",
        "very high fever and she is not making sense",
    ],
)
def test_confusion_with_high_fever_is_detected(description):
    guidance = screen_for_emergency(description)

    assert guidance is not None, f"no emergency guidance for {description!r}"
    assert guidance.category == "sepsis_meningitis"


def test_the_fixed_case_reaches_the_emergent_tier():
    """The whole point: the rule layer, not just the screener, escalates."""
    result = rules_triage.classify("my neck is stiff and I have a fever")

    assert result.tier_name == "EMERGENT"
    assert result.emergency is not None
    assert result.emergency.category == "sepsis_meningitis"
    assert result.defaulted is False


# ---------------------------------------------------------------------------
# One concept is never enough. A combination is an AND, not an OR.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "description",
    [
        "my neck is stiff",
        "I have a fever",
        "a rash on my arm",
        "itchy rash",
        "I feel confused",
        "stiffness in my neck after sleeping badly",
    ],
)
def test_a_single_concept_does_not_fire_a_combination(description):
    assert symptom_concepts.screen_combinations(description) is None


def test_every_combination_needs_all_of_its_concepts():
    for combination in symptom_concepts.combinations():
        assert len(combination.required) >= 2, (
            f"{combination.rule_id} requires {combination.required} — a "
            "one-concept 'combination' is a phrase list entry, and belongs in "
            "emergency.py where a reviewer reads the phrases."
        )


# ---------------------------------------------------------------------------
# Nothing else changed. These are the structural guards.
# ---------------------------------------------------------------------------


_ALREADY_MATCHED = [
    ("chest pain", "cardiac"),
    ("crushing chest pressure", "cardiac"),
    ("can't breathe", "breathing"),
    ("shortness of breath", "breathing"),
    ("face drooping and slurred speech", "stroke"),
    ("worst headache of my life", "stroke"),
    ("severe bleeding", "bleeding_trauma"),
    ("throat closing", "anaphylaxis"),
    ("having a seizure", "consciousness"),
    ("suicidal", "self_harm"),
    ("took too many pills", "overdose_poisoning"),
    ("stiff neck and fever", "sepsis_meningitis"),
    ("sudden vision loss", "vision_loss"),
    ("baby has a fever", "infant_fever"),
    ("bleeding while pregnant", "pregnancy"),
]


@pytest.mark.parametrize("description,expected_category", _ALREADY_MATCHED)
def test_literal_matches_are_unchanged(description, expected_category):
    """A description that matched a literal phrase still matches it, first."""
    guidance = screen_for_emergency(description)

    assert guidance is not None
    assert guidance.category == expected_category


@pytest.mark.parametrize("description,_expected", _ALREADY_MATCHED)
def test_the_combinator_is_never_what_answered_a_literal_match(
    monkeypatch, description, _expected
):
    """
    Disabling the combinator entirely must not change any of these.

    This is the load-bearing property: the second pass runs only after the
    first found nothing, so every pre-existing detection is produced by the
    same code that always produced it.
    """
    with_combinator = screen_for_emergency(description)

    monkeypatch.setattr(
        symptom_concepts, "screen_combinations", lambda _text: None
    )
    without_combinator = screen_for_emergency(description)

    assert without_combinator is not None, (
        f"{description!r} is now only detected via the concept combinator — "
        "it used to be a literal phrase match, so something removed a phrase."
    )
    assert with_combinator is not None
    assert with_combinator.category == without_combinator.category
    assert with_combinator.headline == without_combinator.headline
    assert with_combinator.action == without_combinator.action


@pytest.mark.parametrize(
    "description",
    [
        "a sore throat",
        "runny nose and a mild cough",
        "a paper cut on my finger",
        "mild heartburn after dinner",
        "hiccups",
        "a bruise on my shin",
    ],
)
def test_ordinary_complaints_still_match_no_emergency(description):
    """The combinator must not drag everyday descriptions into EMERGENT."""
    assert screen_for_emergency(description) is None


# ---------------------------------------------------------------------------
# The module authors no copy, and claims nothing the reviewed copy does not.
# ---------------------------------------------------------------------------


def test_every_combination_targets_a_category_that_already_exists():
    """
    A combination may only resolve to a category emergency.py already defines.

    An unknown category would mean the combinator had to supply its own
    wording, which is how a second copy of an emergency instruction gets
    written.
    """
    known = {category for category, _h, _a, _p in _EMERGENCY_RULES}

    for combination in symptom_concepts.combinations():
        assert combination.category in known, (
            f"{combination.rule_id} targets unknown category "
            f"{combination.category!r}"
        )


def test_a_combination_shows_the_existing_reviewed_copy_verbatim():
    """What the user reads is the phrase list's copy, byte for byte."""
    copy = {
        category: (headline, action)
        for category, headline, action, _phrases in _EMERGENCY_RULES
    }

    guidance = screen_for_emergency("my neck is stiff and I have a fever")

    assert guidance is not None
    expected_headline, expected_action = copy[guidance.category]
    assert guidance.headline == expected_headline
    assert guidance.action == expected_action


def test_every_combination_only_uses_concepts_the_lexicon_defines():
    known = set(symptom_concepts.concept_ids())

    for combination in symptom_concepts.combinations():
        for concept in combination.required:
            assert concept in known, (
                f"{combination.rule_id} requires undefined concept "
                f"{concept!r}"
            )


def test_the_set_of_combinations_is_fenced():
    """
    ⛔ Exactly three combinations, each read out of existing reviewed copy.

    The sepsis_meningitis action text names "a stiff neck with fever, a rash
    that does not fade when pressed, or confusion with a high fever". Those
    three are implementable without authoring a clinical claim because the
    app already says them.

    A fourth is a new clinical claim and needs the clinician sign-off CLAUDE.md
    requires. If you are here because this test failed, that is the
    conversation to have — not a line to update.
    """
    assert {c.rule_id for c in symptom_concepts.combinations()} == {
        "stiff_neck_with_fever",
        "rash_that_does_not_fade",
        "confusion_with_high_fever",
    }


def test_every_combination_records_the_copy_it_came_from():
    for combination in symptom_concepts.combinations():
        assert combination.basis.strip(), (
            f"{combination.rule_id} has no basis — a reviewer cannot check "
            "that it claims nothing new without one."
        )


# ---------------------------------------------------------------------------
# detect() reports, it does not interpret.
# ---------------------------------------------------------------------------


def test_detect_reports_which_words_named_each_concept():
    named = symptom_concepts.detect("my neck is stiff and I have a fever")

    assert named["stiff_neck"] == ["neck is stiff"]
    assert named["fever"] == ["fever"]


def test_detect_is_empty_for_empty_input():
    assert symptom_concepts.detect("") == {}
    assert symptom_concepts.detect("   ") == {}


def test_detect_names_no_concept_it_was_not_given():
    named = symptom_concepts.detect("I have a headache")

    assert named == {}, (
        "a headache is not any of the concepts in the lexicon; naming one "
        "would mean the matcher is inferring rather than reading"
    )
