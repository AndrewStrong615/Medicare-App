"""
Tests for emergency red-flag screening.

These matter more than most: a miss here means someone describing a heart
attack is shown reading material instead of being told to call 911.
"""

import pytest

from app.core.emergency import screen_for_emergency


@pytest.mark.parametrize(
    "query,expected_category",
    [
        ("chest pain", "cardiac"),
        ("crushing chest pressure", "cardiac"),
        ("I think I'm having a heart attack", "cardiac"),
        ("difficulty breathing", "breathing"),
        ("can't breathe", "breathing"),
        ("shortness of breath", "breathing"),
        ("face drooping and slurred speech", "stroke"),
        ("worst headache of my life", "stroke"),
        ("severe bleeding", "bleeding_trauma"),
        ("coughing up blood", "bleeding_trauma"),
        ("throat closing", "anaphylaxis"),
        ("severe allergic reaction", "anaphylaxis"),
        ("having a seizure", "consciousness"),
        ("unresponsive", "consciousness"),
        ("suicidal", "self_harm"),
        ("I want to die", "self_harm"),
        ("took too many pills", "overdose_poisoning"),
    ],
)
def test_emergency_language_is_detected(query, expected_category):
    guidance = screen_for_emergency(query)

    assert guidance is not None, f"no emergency guidance for {query!r}"
    assert guidance.category == expected_category
    assert guidance.matched_terms


@pytest.mark.parametrize(
    "query",
    [
        "can’t breathe",  # iOS curly apostrophe
        "bleeding won’t stop",
        "I can‘t breathe",  # left single quote
    ],
)
def test_smart_apostrophes_still_match(query):
    # iOS substitutes a curly apostrophe as the user types, so matching the
    # ASCII form literally would miss these on the primary target platform.
    assert screen_for_emergency(query) is not None


def test_extra_whitespace_does_not_defeat_matching():
    assert screen_for_emergency("chest    pain") is not None


@pytest.mark.parametrize(
    "query,expected_category",
    [
        ("sudden vision loss", "vision_loss"),
        ("stiff neck and fever", "sepsis_meningitis"),
        ("baby has a fever", "infant_fever"),
        ("bleeding while pregnant", "pregnancy"),
    ],
)
def test_additional_red_flag_categories(query, expected_category):
    guidance = screen_for_emergency(query)

    assert guidance is not None
    assert guidance.category == expected_category


@pytest.mark.parametrize(
    "query,expected_category",
    [
        # A user writes "my X is Y-ing", not the gerund-noun phrase the
        # original lists matched literally. Found via ad-hoc testing against
        # common illness descriptions: real anaphylaxis/breathing/vision-loss
        # phrasing was falling through to no match at all.
        ("my throat is closing and my tongue is swelling", "anaphylaxis"),
        ("my lips are swelling up", "anaphylaxis"),
        ("chest feels tight and it hurts", "cardiac"),
        ("I am having a hard time breathing", "breathing"),
        ("I can't catch my breath", "breathing"),
        ("I suddenly lost vision in my left eye", "vision_loss"),
        ("stiff neck with a fever", "sepsis_meningitis"),
    ],
)
def test_natural_phrasing_variants_are_detected(query, expected_category):
    guidance = screen_for_emergency(query)

    assert guidance is not None, f"no emergency guidance for {query!r}"
    assert guidance.category == expected_category


def test_no_guidance_instructs_administering_a_treatment():
    # An earlier draft told users to use an epinephrine auto-injector. Giving
    # drug-administration instructions is treatment advice this app must not
    # provide, whatever the situation.
    import re

    from app.core.emergency import _EMERGENCY_RULES

    # Whole words only — "dose" must not match inside "overdose", which is a
    # legitimate word for naming the situation rather than advising a remedy.
    banned = ("auto-injector", "epinephrine", "swallow", "apply", "dose", "medication")
    for _category, headline, action, _phrases in _EMERGENCY_RULES:
        text = f"{headline} {action}".lower()
        for term in banned:
            assert not re.search(rf"(?<!\w){re.escape(term)}(?!\w)", text), (
                f"{term!r} appears in emergency copy: {text}"
            )


def test_detection_is_case_insensitive():
    assert screen_for_emergency("CHEST PAIN") is not None
    assert screen_for_emergency("Chest Pain") is not None


def test_detection_survives_surrounding_words_and_punctuation():
    assert screen_for_emergency("sudden chest pain, help!") is not None
    assert screen_for_emergency("my dad has trouble breathing") is not None


def test_self_harm_guidance_points_to_a_crisis_line_not_the_app():
    guidance = screen_for_emergency("suicidal thoughts")

    assert guidance is not None
    assert "988" in guidance.action


@pytest.mark.parametrize(
    "query", ["chest pain", "stroke", "anaphylaxis", "overdose", "suicidal"]
)
def test_emergency_guidance_routes_to_help_without_asserting_a_diagnosis(query):
    # Conditional phrasing ("if you have chest pain, call 911") is correct and
    # expected. What must never appear is the app telling someone what they
    # have or what to take.
    guidance = screen_for_emergency(query)
    assert guidance is not None

    text = f"{guidance.headline} {guidance.action}".lower()

    for asserted_diagnosis in (
        "you are having a",
        "you have had a",
        "this is a heart attack",
        "you are having a stroke",
        "diagnos",
    ):
        assert asserted_diagnosis not in text

    # And it must always give a way to reach real help.
    assert "911" in text or "988" in text


@pytest.mark.parametrize(
    "query",
    [
        "sore throat",
        "seasonal allergies",
        "vitamin d",
        "knee pain",
        "heartburn",
    ],
)
def test_ordinary_searches_do_not_trigger_emergency_guidance(query):
    assert screen_for_emergency(query) is None


def test_blank_query_returns_nothing():
    assert screen_for_emergency("") is None
    assert screen_for_emergency("   ") is None


# ---------------------------------------------------------------------------
# FIXED, with explicit human approval (2026-09-01). Regression tests below.
#
# Red-flag screening is defeated when two lines of a list arrive with no
# separator between them. "Chest pain" and "Shortness of breath" as separate
# list items become "Chest painShortness of breath", and the word boundaries
# in `_compile` mean NOTHING matches: not chest pain, not shortness of breath.
# The description is then unrecognised, so it takes the URGENT default rather
# than EMERGENT, and the user is not told to call 911.
#
# This was found from a real submission in the dev log, where a pasted list of
# cold symptoms arrived as "Runny or stuffy noseScratchy or sore throatMild
# cough". That one was harmless. The same glue on a cardiac description is not.
#
# THE FIX IS ONE LINE, in `normalize_query`: insert a space at a lowercase-to-
# uppercase boundary, so "painShortness" becomes "pain Shortness" before any
# matching happens. It can only ever make screening MORE sensitive — it splits
# words apart, it never joins them — so it cannot cause a miss.
#
# `app/core/emergency.py` is fenced by CLAUDE.md. The fix was applied only
# after the user approved it directly, which is the "explicit human approval
# obtained outside of this pipeline" that fence requires. These tests now
# guard it: if the split is ever removed, they fail rather than going quiet.
# ---------------------------------------------------------------------------

GLUED_RED_FLAGS = [
    ("cardiac", "Chest painShortness of breath"),
    ("stroke", "Sudden numbnessTrouble speaking"),
    ("bleeding", "Severe bleedingDizziness"),
]


@pytest.mark.parametrize("category, description", GLUED_RED_FLAGS)
def test_the_same_words_are_screened_when_separated(category, description):
    """Control: with a separator, every one of these is caught today."""
    spaced = description.replace("pain", "pain ").replace("numbness", "numbness ")
    spaced = spaced.replace("bleeding", "bleeding ")

    assert screen_for_emergency(spaced) is not None


@pytest.mark.parametrize("category, description", GLUED_RED_FLAGS)
def test_glued_list_items_are_still_screened(category, description):
    assert screen_for_emergency(description) is not None


# ---------------------------------------------------------------------------
# Two-term red flags, caught by the concept combinator.
#
# The `sepsis_meningitis` action text has always named three combinations —
# "A stiff neck with fever, a rash that does not fade when pressed, or
# confusion with a high fever" — but the phrase list could only detect each
# one written as a single contiguous string, so the ordinary way of writing
# it ("my neck is stiff and I have a fever") matched nothing and fell to the
# URGENT default. That limit was recorded in this module against itself.
#
# `app/core/symptom_concepts.py` closes it, consulted at the end of
# `screen_for_emergency` AFTER every literal phrase has been tried — so it can
# only turn a `None` into guidance, never change a category. The full set of
# structural guarantees is tested in `test_symptom_concepts.py`; these are the
# regression cases for the screening behaviour itself.
# ---------------------------------------------------------------------------

TWO_TERM_RED_FLAGS = [
    "my neck is stiff and I have a fever",
    "I have a fever and my neck has gone stiff",
    "burning up and I can't turn my neck",
    "I have a rash and it doesn't fade when I press it",
    "he is confused and has a really high temperature",
]


@pytest.mark.parametrize("description", TWO_TERM_RED_FLAGS)
def test_two_term_red_flags_are_screened(description):
    guidance = screen_for_emergency(description)

    assert guidance is not None, f"no emergency guidance for {description!r}"
    assert guidance.category == "sepsis_meningitis"


@pytest.mark.parametrize(
    "description",
    [
        "my neck is stiff",
        "I have a fever",
        "a rash on my arm",
        "I feel confused",
    ],
)
def test_one_half_of_a_two_term_flag_is_not_enough(description):
    """A combination is an AND. Half of one must not fire it."""
    assert screen_for_emergency(description) is None
