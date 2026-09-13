"""
Measures whether the goal planner writes a plan for the goal it was given, or
the same plan for everything.

    cd backend
    python scripts/goal_plan_eval/measure.py
    python scripts/goal_plan_eval/measure.py --show    # print every plan
    python scripts/goal_plan_eval/measure.py --json
    python scripts/goal_plan_eval/measure.py --strict  # non-zero exit when a
                                                       # threshold is breached

WHY THIS EXISTS: reported on 2026-09-13 — "I said I want to lose a hundred
pounds, and I said I want to lose one pound, and it gave me the same plan."
The same class of bug had already been found and fixed once in the titles, and
CLAUDE.md records how: by running it against the live deployment and counting,
not by reading the prompt and reasoning. This is that count, made repeatable.

⛔ THIS CALLS A REAL MODEL ENDPOINT AND COSTS WHATEVER THAT ENDPOINT COSTS.
Unlike scripts/triage_eval/measure.py, which runs an offline phrase list, this
needs `GROQ_API_KEY` or the `GOALS_LLM_*` settings — see docs/free-model-setup.md.
With none configured it says so and exits rather than reporting a zero.

⛔ WHAT THIS MEASURES, AND WHAT IT DOES NOT. It measures whether plans differ
from one another and whether they contain any trace of the goal's own words.
That is a measure of RESPONSIVENESS, which is what was reported broken. It is
not a measure of whether a plan is good, safe, achievable or clinically sound —
nobody qualified has read `PLAN_SYSTEM_PROMPT`, and a set of plans that scored
perfectly here could still be a set of plans no clinician would endorse. The
release blocker in CLAUDE.md is untouched by any number printed below.

SYNTHETIC INPUT ONLY. Every description is invented; see corpus.py. Running
this transmits those descriptions to whichever endpoint is configured, which is
the same third-party exposure CLAUDE.md documents for the feature itself — so
do not put a real person's text in the corpus and then run it.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
# backend/ , so that `app.*` resolves however this is invoked.
sys.path.insert(0, str(HERE.parent.parent))

from app.core import goal_structuring  # noqa: E402
from app.services import llm  # noqa: E402

from corpus import CORPUS, Goal, pairs  # noqa: E402


# A row that turns up on this many goals or more is printed by name. Three is
# the point at which "it fits several goals" stops being a fair reading.
REPEATED_ON = 3

# Thresholds for --strict. They are judgement calls, not findings: a plan set
# that passes them is not thereby good, and one that fails them is worth
# looking at rather than automatically wrong.
MAX_REPEAT_SHARE = 0.20  # share of all rows that appear on more than one goal
MAX_PAIR_OVERLAP = 0.34  # Jaccard between the two halves of a contrast pair
MIN_ANCHOR_SHARE = 0.70  # goals whose plan uses at least one of their anchors


def normalise(text: str) -> str:
    """
    A row reduced to what makes two rows the same row.

    Deliberately crude: case, punctuation and whitespace only. It will not
    notice that "Walk after lunch" and "Take a walk after lunch" are the same
    row, so every repeat figure here is a FLOOR on repetition and never a
    ceiling.
    """
    return re.sub(r"[^a-z0-9 ]+", "", text.lower()).strip()


class Outcome:
    """One goal, planned — or not."""

    __slots__ = ("goal", "title", "rows", "failure")

    def __init__(
        self,
        goal: Goal,
        title: str = "",
        rows: tuple[str, ...] = (),
        failure: str = "",
    ):
        self.goal = goal
        self.title = title
        self.rows = rows
        self.failure = failure

    @property
    def planned(self) -> bool:
        return not self.failure

    @property
    def row_set(self) -> set[str]:
        return {normalise(row) for row in self.rows}

    @property
    def anchors_hit(self) -> tuple[str, ...]:
        """Which of this goal's anchor words appear anywhere in the plan."""
        haystack = normalise(" ".join((self.title, *self.rows)))
        return tuple(a for a in self.goal.anchors if normalise(a) in haystack)


def plan(goal: Goal) -> Outcome:
    result = goal_structuring.suggest_plan(goal.text)

    if isinstance(result, goal_structuring.GoalDraft):
        return Outcome(
            goal,
            title=result.title,
            rows=tuple(activity.text for activity in result.activities),
        )
    if isinstance(result, goal_structuring.Refusal):
        return Outcome(goal, failure=f"refused ({result.reason})")
    if isinstance(result, goal_structuring.Busy):
        return Outcome(goal, failure="rate limited")
    return Outcome(goal, failure="no plan (endpoint or check)")


def measure(outcomes: list[Outcome]) -> dict:
    planned = [o for o in outcomes if o.planned]

    rows = [normalise(row) for o in planned for row in o.rows]
    goals_per_row: dict[str, set[str]] = defaultdict(set)
    for outcome in planned:
        for row in outcome.row_set:
            goals_per_row[row].add(outcome.goal.id)

    shared = {row: ids for row, ids in goals_per_row.items() if len(ids) > 1}
    repeated_rows = sum(1 for row in rows if row in shared)

    titles = Counter(normalise(o.title) for o in planned)
    colliding_titles = {t: n for t, n in titles.items() if n > 1 and t}

    pair_overlaps = {}
    for pair_id, members in pairs().items():
        halves = [o for o in planned if o.goal.id in {g.id for g in members}]
        if len(halves) < 2:
            continue
        a, b = halves[0].row_set, halves[1].row_set
        union = a | b
        pair_overlaps[pair_id] = {
            "overlap": (len(a & b) / len(union)) if union else 0.0,
            "shared_rows": sorted(a & b),
            "goals": [h.goal.id for h in halves],
            "note": members[0].note + " / " + members[1].note,
        }

    anchored = [o for o in planned if o.goal.anchors]
    anchor_hits = [o for o in anchored if o.anchors_hit]

    return {
        "goals": len(outcomes),
        "planned": len(planned),
        "failures": [
            {"goal": o.goal.id, "why": o.failure} for o in outcomes if not o.planned
        ],
        "rows_total": len(rows),
        "rows_distinct": len(goals_per_row),
        "repeat_share": (repeated_rows / len(rows)) if rows else 0.0,
        "rows_on_many_goals": sorted(
            (
                {"row": row, "goals": sorted(ids)}
                for row, ids in shared.items()
                if len(ids) >= REPEATED_ON
            ),
            key=lambda entry: -len(entry["goals"]),
        ),
        "title_collisions": colliding_titles,
        "pairs": pair_overlaps,
        "anchor_share": (len(anchor_hits) / len(anchored)) if anchored else 0.0,
        "anchor_misses": [o.goal.id for o in anchored if not o.anchors_hit],
    }


def breaches(report: dict) -> list[str]:
    """The --strict findings, in the order they are worth reading."""
    found = []
    if report["repeat_share"] > MAX_REPEAT_SHARE:
        found.append(
            f"{report['repeat_share']:.0%} of rows appear on more than one goal "
            f"(threshold {MAX_REPEAT_SHARE:.0%})"
        )
    for pair_id, data in report["pairs"].items():
        if data["overlap"] > MAX_PAIR_OVERLAP:
            found.append(
                f"contrast pair {pair_id} overlaps {data['overlap']:.0%} "
                f"(threshold {MAX_PAIR_OVERLAP:.0%}): {data['note']}"
            )
    if report["title_collisions"]:
        found.append(
            "titles reused across goals: "
            + ", ".join(sorted(report["title_collisions"]))
        )
    if report["anchor_share"] < MIN_ANCHOR_SHARE:
        found.append(
            f"only {report['anchor_share']:.0%} of plans use any word from "
            f"their own goal (threshold {MIN_ANCHOR_SHARE:.0%})"
        )
    return found


def render(report: dict, outcomes: list[Outcome], show: bool) -> None:
    print()
    print("GOAL PLAN RESPONSIVENESS")
    print("=" * 72)
    print(f"  goals planned            {report['planned']}/{report['goals']}")
    print(
        f"  distinct rows            {report['rows_distinct']}"
        f" of {report['rows_total']}"
    )
    print(f"  rows shared across goals {report['repeat_share']:.1%}")
    print(f"  plans using a goal word  {report['anchor_share']:.1%}")
    print()

    if report["failures"]:
        print("  NO PLAN")
        for entry in report["failures"]:
            print(f"    {entry['goal']:<24} {entry['why']}")
        print()

    if report["rows_on_many_goals"]:
        print(f"  ROWS APPEARING ON {REPEATED_ON}+ GOALS  (the template, if there is one)")
        for entry in report["rows_on_many_goals"]:
            print(f"    {len(entry['goals'])}x  {entry['row']}")
            print(f"        {', '.join(entry['goals'])}")
        print()

    print("  CONTRAST PAIRS  (two goals that must not get one plan)")
    for pair_id, data in report["pairs"].items():
        print(f"    {pair_id:<16} overlap {data['overlap']:.0%}   {data['note']}")
        for row in data["shared_rows"]:
            print(f"        shared: {row}")
    print()

    if report["title_collisions"]:
        print("  TITLES REUSED")
        for title, count in sorted(report["title_collisions"].items()):
            print(f"    {count}x  {title}")
        print()

    if report["anchor_misses"]:
        print("  NO WORD OF THE GOAL IN THE PLAN  (lexical proxy; read these)")
        for goal_id in report["anchor_misses"]:
            print(f"    {goal_id}")
        print()

    if show:
        print("  PLANS")
        for outcome in outcomes:
            print(f"    --- {outcome.goal.id}")
            print(f"        goal:  {outcome.goal.text}")
            if not outcome.planned:
                print(f"        {outcome.failure}")
                continue
            print(f"        title: {outcome.title}")
            for row in outcome.rows:
                print(f"          - {row}")
        print()

    print("  ⛔ Responsiveness only. Nothing here says a plan is safe or good,")
    print("     and no clinician has read the prompt that wrote them.")
    print()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--show", action="store_true", help="print every plan")
    parser.add_argument("--json", action="store_true", help="machine-readable")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="exit non-zero when a threshold is breached",
    )
    args = parser.parse_args()

    if not goal_structuring.available():
        print(
            "No goals model endpoint is configured, so there is nothing to "
            "measure.\nSet GROQ_API_KEY (or the GOALS_LLM_* settings) — see "
            "docs/free-model-setup.md.",
            file=sys.stderr,
        )
        return 2

    endpoint = llm.goals_endpoint()
    if not args.json:
        local = "local" if llm.endpoint_is_local(endpoint) else "REMOTE"
        print(f"\nendpoint: {endpoint.model} ({local})")
        print(f"temperature: {goal_structuring.PLAN_TEMPERATURE}")

    outcomes = [plan(goal) for goal in CORPUS]
    report = measure(outcomes)
    found = breaches(report)

    if args.json:
        print(json.dumps({**report, "breaches": found}, indent=2))
    else:
        render(report, outcomes, args.show)
        for breach in found:
            print(f"  BREACH  {breach}")
        if found:
            print()

    return 1 if (args.strict and found) else 0


if __name__ == "__main__":
    raise SystemExit(main())
