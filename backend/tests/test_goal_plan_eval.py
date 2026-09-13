"""
The goal-plan responsiveness harness: its arithmetic, offline.

`scripts/goal_plan_eval/measure.py` needs a live model endpoint to collect
plans, which is exactly why the part that turns plans into numbers is tested
here instead. A harness that silently mis-counts is worse than no harness: it
is a number somebody quotes.

So these hand two known plan sets to `measure()` and assert what comes back —
including the bug that caused it to be written, where the two halves of a
contrast pair come back identical.

⛔ Nothing here calls a model. `conftest._no_live_model` would stop it anyway.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

_EVAL_DIR = Path(__file__).resolve().parent.parent / "scripts" / "goal_plan_eval"


def _load(name: str):
    path = _EVAL_DIR / f"{name}.py"
    spec = importlib.util.spec_from_file_location(f"goal_plan_eval_{name}", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    # measure.py does `from corpus import ...`, the way it resolves when the
    # script is run directly.
    sys.path.insert(0, str(_EVAL_DIR))
    try:
        spec.loader.exec_module(module)
    finally:
        sys.path.remove(str(_EVAL_DIR))
    return module


corpus = _load("corpus")
measure = _load("measure")


def _outcome(goal_id: str, title: str, rows: tuple[str, ...]):
    goal = next(g for g in corpus.CORPUS if g.id == goal_id)
    return measure.Outcome(goal, title=title, rows=rows)


# ---------------------------------------------------------------------------
# The corpus itself.
# ---------------------------------------------------------------------------


def test_the_reported_pair_is_in_the_corpus():
    """
    The bug was reported as one pair of goals. If the corpus ever stops
    carrying it, the harness has stopped measuring the thing it was built for.
    """
    grouped = corpus.pairs()

    assert "weight-scale" in grouped
    ids = {goal.id for goal in grouped["weight-scale"]}
    assert ids == {"weight-one-pound", "weight-hundred-pounds"}

    # Both halves are the same domain, so only scale can separate them.
    for goal in grouped["weight-scale"]:
        assert "lose" in goal.text


def test_every_contrast_pair_has_exactly_two_halves():
    for pair_id, members in corpus.pairs().items():
        assert len(members) == 2, pair_id


# ---------------------------------------------------------------------------
# The arithmetic.
# ---------------------------------------------------------------------------


def test_two_identical_plans_for_one_contrast_pair_is_a_total_overlap():
    """
    ⛔ THE REPORTED BUG, EXPRESSED AS A NUMBER.

    "I said I want to lose a hundred pounds, and I said I want to lose one
    pound, and it gave me the same plan." Two identical plans must come back
    as an overlap of 100% and as a --strict breach, or the harness would have
    reported the bug as fine.
    """
    generic = ("Walk after lunch", "Go to bed at the same time each night")
    outcomes = [
        _outcome("weight-one-pound", "Daily routine", generic),
        _outcome("weight-hundred-pounds", "Daily routine", generic),
    ]

    report = measure.measure(outcomes)

    assert report["pairs"]["weight-scale"]["overlap"] == 1.0
    assert report["repeat_share"] == 1.0
    assert report["rows_distinct"] == 2
    assert report["rows_total"] == 4
    assert report["title_collisions"] == {"daily routine": 2}

    found = measure.breaches(report)
    assert any("weight-scale" in breach for breach in found)
    assert any("titles reused" in breach for breach in found)


def test_two_plans_that_answered_their_own_goals_breach_nothing():
    outcomes = [
        _outcome(
            "weight-one-pound",
            "A month of shorter evenings",
            ("Walk to the shop instead of driving", "Put the kettle on instead of a snack"),
        ),
        _outcome(
            "weight-hundred-pounds",
            "Two years of Sunday cooking",
            ("Cook a batch on Sunday for the week", "Take the stairs at work"),
        ),
    ]

    report = measure.measure(outcomes)

    assert report["pairs"]["weight-scale"]["overlap"] == 0.0
    assert report["repeat_share"] == 0.0
    assert report["title_collisions"] == {}
    assert measure.breaches(report) == []


def test_a_row_is_counted_as_repeated_only_across_different_goals():
    """
    A plan that lists something twice is a different defect. Repetition here
    means the same row turning up on somebody else's goal.
    """
    outcomes = [
        _outcome("walk-dog", "Mornings with the dog", ("Walk the dog", "Walk the dog")),
        _outcome("walk-desk", "Standing at the desk", ("Stand up every hour",)),
    ]

    report = measure.measure(outcomes)

    assert report["repeat_share"] == 0.0
    assert report["pairs"]["walk-what"]["overlap"] == 0.0


def test_the_anchor_rate_notices_a_plan_with_no_word_of_its_own_goal():
    """
    The lexical proxy, and it is only a proxy — which is why the harness prints
    the misses by name rather than only a percentage.
    """
    outcomes = [
        _outcome("walk-dog", "Mornings out", ("Walk the dog before work",)),
        _outcome("meds-routine", "A quieter wind down", ("Sit still for ten minutes",)),
    ]

    report = measure.measure(outcomes)

    assert report["anchor_share"] == 0.5
    assert report["anchor_misses"] == ["meds-routine"]


def test_a_goal_with_no_plan_is_reported_and_not_scored():
    """
    A refusal or an outage is not a repetitive plan, and must not be counted as
    one. It is listed instead, so a run that mostly failed cannot read as a run
    that mostly succeeded.
    """
    failed = measure.Outcome(
        next(g for g in corpus.CORPUS if g.id == "vague-healthier"),
        failure="rate limited",
    )
    outcomes = [
        _outcome("walk-dog", "Mornings with the dog", ("Walk the dog before work",)),
        failed,
    ]

    report = measure.measure(outcomes)

    assert report["goals"] == 2
    assert report["planned"] == 1
    assert report["failures"] == [{"goal": "vague-healthier", "why": "rate limited"}]
    assert report["rows_total"] == 1


def test_normalise_ignores_case_and_punctuation_only():
    """
    Crude on purpose. It must fold the trivial differences and it must NOT
    claim two differently-worded rows are one, because every repeat figure is
    then a floor rather than a guess.
    """
    assert measure.normalise("Walk after lunch.") == measure.normalise("walk after lunch")
    assert measure.normalise("Walk after lunch") != measure.normalise(
        "Take a walk after lunch"
    )
