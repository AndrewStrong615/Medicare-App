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
