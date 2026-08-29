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
