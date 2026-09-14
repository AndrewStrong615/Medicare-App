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


# ---------------------------------------------------------------------------
# Reading a deployment's answer, offline.
#
# `--api` exists so a run needs no local key. It is the mode that measures the
# deployed code, which is the only way to get a BEFORE number for a prompt
# change — so what it does with a failed draft matters as much as what it does
# with a good one.
# ---------------------------------------------------------------------------


def _goal(goal_id: str):
    return next(g for g in corpus.CORPUS if g.id == goal_id)


def test_a_draft_with_activities_is_read_as_a_plan():
    outcome = measure.outcome_from_draft(
        _goal("walk-dog"),
        200,
        {
            "title": "Mornings with the dog",
            "activities": [
                {"text": "Walk the dog before work"},
                {"text": "Put the lead by the door the night before"},
            ],
            "notice": None,
        },
    )

    assert outcome.planned
    assert outcome.title == "Mornings with the dog"
    assert len(outcome.rows) == 2


def test_a_draft_with_no_activities_carries_the_notice_as_the_failure():
    """
    "MedHelp has no suggestions right now", a rate limit and a refusal all
    arrive as an empty activity list. The notice is the only thing telling them
    apart from out here, so it is not thrown away.
    """
    outcome = measure.outcome_from_draft(
        _goal("vague-healthier"),
        200,
        {"title": None, "activities": [], "notice": "MedHelp is busy. Try again."},
    )

    assert not outcome.planned
    assert outcome.failure == "MedHelp is busy. Try again."


def test_a_red_flag_is_reported_as_guidance_rather_than_as_a_refusal():
    """
    A description that trips emergency screening gets no plan at all, by
    design. Counting that as "the planner declined" would misreport the one
    behaviour in this feature that is not allowed to change.
    """
    outcome = measure.outcome_from_draft(
        _goal("vague-energy"),
        200,
        {
            "title": None,
            "activities": [],
            "notice": None,
            "emergency": {"headline": "Call 911 now"},
        },
    )

    assert not outcome.planned
    assert "emergency guidance" in outcome.failure


def test_an_http_error_is_a_failure_and_never_an_empty_plan():
    outcome = measure.outcome_from_draft(_goal("walk-desk"), 503, {})

    assert not outcome.planned
    assert outcome.failure == "HTTP 503"


# ---------------------------------------------------------------------------
# ⛔ THE EXACT MATCHER REPORTED THE REPORTED BUG AS ABSENT.
#
# The first clean baseline scored the two smoking goals at 0% overlap. Their
# plans were walk / water / breathing break / call a friend on both sides, in
# slightly different words. A metric that misses the thing it was built to
# catch is worse than no metric, so rewordings are counted too.
# ---------------------------------------------------------------------------


def test_a_reworded_row_is_recognised_as_the_same_row():
    assert measure.near(
        "Call or text a friend for a quick chat",
        "Call a friend or family member for a quick chat",
    )
    assert measure.near(
        "Take a 10-minute walk after breakfast", "Take a 5-minute walk outside"
    )


def test_two_genuinely_different_rows_are_not_folded_together():
    """
    The loose threshold has to stay on the right side of this, or every plan
    would look like every other one and the metric would be useless the other
    way round.
    """
    assert not measure.near("Walk the dog before work", "Set a phone alarm for tablet time")
    assert not measure.near("Do seated knee bends", "Prepare a simple home-cooked dinner")


def test_the_soft_overlap_catches_a_pair_the_exact_one_scores_at_zero():
    a = {"take a 10minute walk after breakfast", "drink a glass of water when you feel the urge to smoke"}
    b = {"take a 5minute walk outside", "drink a glass of water"}

    assert not (a & b), "precondition: nothing matches exactly"
    assert measure.soft_overlap(a, b) > 0


def test_strict_reads_the_soft_overlap():
    """
    A pair whose halves are the same plan reworded must breach, even though
    not one row matches character for character.
    """
    outcomes = [
        _outcome(
            "quit-today",
            "Walks and water",
            ("Take a 10-minute walk after breakfast", "Drink a glass of water now"),
        ),
        _outcome(
            "quit-year",
            "Water and walks",
            ("Take a 5-minute walk outside", "Drink a glass of water"),
        ),
    ]

    report = measure.measure(outcomes)

    assert report["pairs"]["quit-scale"]["overlap"] == 0.0
    assert report["pairs"]["quit-scale"]["soft_overlap"] > measure.MAX_PAIR_OVERLAP
    assert any("quit-scale" in breach for breach in measure.breaches(report))


# ---------------------------------------------------------------------------
# Collecting and measuring are separable, which is what let the metric above
# be corrected without paying for the baseline a second time.
# ---------------------------------------------------------------------------


def test_a_saved_run_measures_identically_when_loaded_back(tmp_path):
    outcomes = [
        _outcome("walk-dog", "Mornings with the dog", ("Walk the dog before work",)),
        measure.Outcome(_goal("vague-healthier"), failure="rate limited"),
    ]
    path = tmp_path / "run.json"

    measure.save(outcomes, path, "a label", "a source")
    loaded, label, source = measure.load(path)

    assert label == "a label"
    assert source == "a source"
    assert measure.measure(loaded) == measure.measure(outcomes)


def test_the_committed_baseline_still_loads_and_still_shows_the_reported_bug():
    """
    ⛔ THE BEFORE NUMBERS, PINNED.

    This is the run quoted in CLAUDE.md, taken against the deployment on
    2026-09-13. If the corpus changes under it the load fails loudly rather
    than quietly reporting a different baseline — and the two weight goals
    must still come back sharing rows, because that is the bug that was
    reported and this file is the evidence of it.
    """
    path = _EVAL_DIR / "runs" / "2026-09-13-before-deployed-main.json"
    outcomes, _, source = measure.load(path)

    assert "onrender.com" in source
    report = measure.measure(outcomes)

    assert report["goals"] == 16
    assert report["planned"] == 16
    assert report["pairs"]["weight-scale"]["overlap"] > 0.3
    assert report["anchor_share"] < measure.MIN_ANCHOR_SHARE
    assert measure.breaches(report), "the baseline is the failing state"


# ---------------------------------------------------------------------------
# How much of a week a plan fills.
#
# Added 2026-09-13 with the coverage check in `_validate_plan`. A row count
# cannot see the reported failure — four rows on four days answering a
# year-long goal — so the harness could not have reported it either.
# ---------------------------------------------------------------------------


WEEK = (
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
)


def _scheduled(goal_id: str, title: str, rows, day_sets, complexity: str):
    """
    An outcome carrying a real schedule: one tuple of day names per row.

    ⛔ Day names rather than counts, because `days_touched` cannot be derived
    from counts and it is the number the gate reads. The helper used to take
    counts, which silently reported every plan as appearing on zero days.
    """
    goal = next(g for g in corpus.CORPUS if g.id == goal_id)
    return measure.Outcome(
        goal,
        title=title,
        rows=tuple(rows),
        day_counts=tuple(len(days) for days in day_sets),
        days_touched=len({day for days in day_sets for day in days}),
        complexity=complexity,
    )


def test_a_run_that_recorded_no_days_reports_no_coverage_at_all():
    """
    ⛔ ABSENT, NOT ZERO.

    The committed BEFORE run predates the schedule being recorded. Reporting
    it as a mean of 0.0 day-slots would read as a damning finding about those
    plans rather than as a fact about the run, and the before/after comparison
    this harness exists for would be a comparison of two different things.
    """
    report = measure.measure(
        [
            _outcome("weight-one-pound", "A walk before the wedding", ("Walk on Sunday",)),
            _outcome("weight-hundred-pounds", "Steady weeks", ("Walk after dinner",)),
        ]
    )

    assert report["scheduled"] == 0
    assert report["mean_slots"] == 0.0
    assert report["slots_by_complexity"] == {}
    assert report["thin_major_plans"] == []


def test_the_reported_plan_is_visible_as_a_major_goal_on_four_day_slots():
    """
    The plan the owner was shown, in the shape the harness now measures: four
    rows, one day each, declared major. Four rows is a perfectly good row
    count, which is why this needed a second number.
    """
    report = measure.measure(
        [
            _scheduled(
                "weight-hundred-pounds",
                "Mondays to Thursdays",
                (
                    "Walk for ten minutes",
                    "Drink a glass of water after waking",
                    "Go to bed at the same time",
                    "Cook at home",
                ),
                (("monday",), ("tuesday",), ("wednesday",), ("thursday",)),
                "major",
            )
        ]
    )

    assert report["thin_major_plans"] == ["weight-hundred-pounds"]
    assert report["mean_slots"] == 4.0
    assert report["slots_by_complexity"]["major"]["fewest"] == 4


def test_a_plan_that_fills_a_week_is_not_flagged():
    report = measure.measure(
        [
            _scheduled(
                "weight-hundred-pounds",
                "Stairs, walks home and Sunday cooking",
                (
                    "Walk 30 minutes on the way home",
                    "Cook a batch on Sunday",
                    "Take the stairs at the office",
                    "A bowl of vegetables at dinner",
                ),
                (WEEK[:5], ("sunday",), WEEK[:5], WEEK),
                "major",
            )
        ]
    )

    assert report["thin_major_plans"] == []
    assert report["mean_slots"] == 18.0


def test_coverage_is_reported_per_reading_of_the_goals_size():
    """
    The two halves of the reported pair, which is the comparison the whole
    harness was written for — now on the axis a row count cannot show.
    """
    report = measure.measure(
        [
            _scheduled(
                "weight-one-pound",
                "A walk before the wedding",
                ("Walk to the shop",),
                (("monday", "wednesday", "friday"),),
                "small",
            ),
            _scheduled(
                "weight-hundred-pounds",
                "Stairs and walks home",
                ("Walk 30 minutes on the way home", "Take the stairs"),
                (WEEK[:5], WEEK[:5]),
                "major",
            ),
        ]
    )

    assert report["scheduled"] == 2
    assert report["slots_by_complexity"]["small"]["mean"] == 3.0
    assert report["slots_by_complexity"]["major"]["mean"] == 10.0


# ---------------------------------------------------------------------------
# The --strict gates.
#
# ⛔ A METRIC NOBODY FAILS ON IS A METRIC NOBODY READS. Coverage and
# situatedness were both reported before they were gated, which would have let
# the reported bug pass a --strict run in silence. These tests are here so a
# future metric is not added the same way.
# ---------------------------------------------------------------------------


def test_a_major_goal_on_four_day_slots_is_a_strict_breach():
    report = measure.measure(
        [
            _scheduled(
                "weight-hundred-pounds",
                "Mondays to Thursdays",
                (
                    "Walk for ten minutes after breakfast",
                    "Drink a glass of water after waking",
                    "Go to bed at the same time each night",
                    "Cook at home in the evening",
                ),
                (("monday",), ("tuesday",), ("wednesday",), ("thursday",)),
                "major",
            )
        ]
    )
    found = measure.breaches(report)

    assert any("days of the week" in line for line in found), found


def test_a_plan_that_fills_the_week_raises_no_coverage_breach():
    report = measure.measure(
        [
            _scheduled(
                "weight-hundred-pounds",
                "Stairs, walks home and Sunday cooking",
                (
                    "Walk 30 minutes on the way home from work",
                    "Cook a batch on Sunday morning",
                    "Take the stairs at the office",
                    "A bowl of vegetables at dinner",
                ),
                (WEEK[:5], ("sunday",), WEEK[:5], WEEK),
                "major",
            )
        ]
    )

    assert not any("days of the week" in line for line in measure.breaches(report))


def test_rows_that_name_no_moment_and_no_place_are_a_strict_breach():
    report = measure.measure(
        [
            _outcome(
                "vague-healthier",
                "Feeling better",
                ("Eat better", "Be more active", "Manage stress"),
            )
        ]
    )
    found = measure.breaches(report)

    assert any("when or where" in line for line in found), found
    assert report["situated_share"] == 0.0


def test_a_row_that_names_a_moment_counts_as_situated():
    assert measure.situated("Walk 30 minutes on the way home from work")
    assert measure.situated("Put a bowl of vegetables on the plate at dinner")
    assert measure.situated("Take the stairs at the office")

    # The goal restated, which is the thing the prompt's first test rejects.
    assert not measure.situated("Eat better")
    assert not measure.situated("Be more active")
    assert not measure.situated("Drink more water")


def test_word_boundaries_are_respected_so_an_activity_word_is_not_a_place():
    """
    "workout" is not "work" and "beforehand" is not "before". Without this the
    list would creep into matching the activity words themselves and report
    every plan as situated, which is the failure mode of a crude measure that
    nobody notices.
    """
    assert not measure.situated("Do a workout")
    assert not measure.situated("Stretch beforehand")


def test_a_concrete_row_that_answers_no_goal_still_counts_as_situated():
    """
    ⛔ THE LIMIT, PINNED SO IT IS NOT OVER-READ.

    "Drink a glass of water after waking" is one of the two rows that were
    actually reported, and it scores as situated, because it does name a
    moment. This measure sees whether a row says WHEN or WHERE; it cannot see
    whether the row answers the goal. That is what `repeat_share` and the
    contrast pairs are for, and it is why no deterministic vagueness check was
    built in `goal_structuring`.
    """
    assert measure.situated("Drink a glass of water after waking")
    assert measure.situated("Go to bed at the same time each night")


def test_the_harness_keeps_a_daily_row_plus_weekly_ones_off_the_thin_list():
    """
    ⛔ THE GATE AND THE CHECK HAVE TO COUNT THE SAME THING.

    "Walk every day" plus three weekend errands is 10 day-slots and appears on
    all seven days. `goal_structuring` keeps it; so must this, or a --strict
    run would report a breach for a plan the application was happy with, and
    somebody would "fix" one of the two to agree with the other.
    """
    report = measure.measure(
        [
            _scheduled(
                "weight-hundred-pounds",
                "Daily walks home and a Sunday cook",
                (
                    "Walk 30 minutes on the way home",
                    "Cook a batch for the week on Sunday",
                    "Do the food shop on Saturday",
                    "Set out the week's walks on Monday",
                ),
                (WEEK, ("sunday",), ("saturday",), ("monday",)),
                "major",
            )
        ]
    )

    assert report["mean_slots"] == 10.0
    assert report["mean_days_touched"] == 7.0
    assert report["thin_major_plans"] == []
    assert not any("days of the week" in line for line in measure.breaches(report))


def test_the_floor_the_harness_gates_on_is_the_one_the_application_enforces():
    """
    Two copies of a number in two files is a number that drifts. This is the
    cheapest possible guard against that.
    """
    from app.core import goal_structuring

    fewest_days, _ = goal_structuring.WEEK_SHAPE_BY_COMPLEXITY["major"]
    assert measure.MAJOR_FLOOR_DAYS == fewest_days


def test_a_row_naming_a_day_of_the_week_is_situated():
    """
    A named day is a moment, and rows do name them — "cook a batch on Sunday".
    These were false misses until the day names were added, which is the shape
    of error a short keyword list makes: it under-reports rather than
    over-reports, so the figure is a floor.

    ⛔ This is about the row TEXT, which is what the person reads on the card.
    The plan's own `days` field is a separate thing and is not consulted here.
    """
    assert measure.situated("Cook a batch for the week on Sunday")
    assert measure.situated("Call your sister on Saturday")

    # Still no false positives: an amount is not a moment and not a place.
    assert not measure.situated("Do ten bodyweight squats")
    assert not measure.situated("Stretch for five minutes")


# ---------------------------------------------------------------------------
# Did the plan take a scale the goal stated outright?
#
# The reported complaint was that "lose one pound" and "lose a hundred pounds"
# came back the same. The contrast-pair overlap sees that only when the ROWS
# coincide. This sees the prior question: did the planner even read them as
# different sizes?
#
# ⛔ Bounds, not gold labels, and only on the four goals that state their own
# scale in so many words. See the note on corpus.Goal.
# ---------------------------------------------------------------------------


def test_a_year_long_goal_read_as_small_is_reported_and_gated():
    report = measure.measure(
        [
            _scheduled(
                "weight-hundred-pounds",
                "A walk before dinner",
                ("Take a 15 minute walk after dinner",),
                ((WEEK[:3]),),
                "small",
            )
        ]
    )

    assert report["misread_size"], report
    assert "no smaller than major" in report["misread_size"][0]
    assert any("stated outright" in line for line in measure.breaches(report))


def test_a_one_day_goal_read_as_major_is_reported():
    report = measure.measure(
        [
            _scheduled(
                "quit-today",
                "Getting through today",
                ("Row 1", "Row 2", "Row 3", "Row 4"),
                (WEEK, WEEK, WEEK, WEEK),
                "major",
            )
        ]
    )

    assert report["misread_size"], report
    assert "no larger than moderate" in report["misread_size"][0]


def test_a_goal_that_states_no_scale_is_never_reported():
    """
    ⛔ THE HALF THAT KEEPS THIS HONEST.

    Twelve of the sixteen goals carry no bound, because "is this moderate or
    major" is a judgement and this app should not be scoring itself on one.
    A reading of a goal that never stated its size cannot be wrong here.
    """
    for complexity in ("small", "moderate", "major"):
        report = measure.measure(
            [
                _scheduled(
                    "cooking-budget",
                    "Cooking at home",
                    ("Cook a batch on Sunday",),
                    ((WEEK[:3]),),
                    complexity,
                )
            ]
        )
        assert report["misread_size"] == [], (complexity, report["misread_size"])


def test_a_run_that_recorded_no_complexity_reports_nothing():
    """The committed baseline predates the field; absent is not a finding."""
    report = measure.measure(
        [_outcome("weight-hundred-pounds", "Evening walks", ("Walk after dinner",))]
    )

    assert report["misread_size"] == []
