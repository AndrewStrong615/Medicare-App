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

There are two ways to collect the plans, and they measure different code:

  IN PROCESS (default)   calls `goal_structuring.suggest_plan` here, so it
                         measures the working copy. This is the one that shows
                         whether a change to the prompt worked. Needs
                         `GROQ_API_KEY` or the `GOALS_LLM_*` settings — see
                         docs/free-model-setup.md.

  AGAINST A DEPLOYMENT   `--api https://…` signs in and posts each goal to
                         POST /goals/draft, so it measures whatever is
                         deployed there. Needs no key locally, because the
                         deployment holds one. Use it for a BEFORE baseline,
                         and again after the branch is deployed.

⛔ EITHER WAY THIS CALLS A REAL MODEL AND COSTS WHATEVER THAT COSTS. Unlike
scripts/triage_eval/measure.py, which runs an offline phrase list, there is no
free run of this. With nothing configured it says so and exits rather than
reporting a zero.

⛔ `--api` WRITES A USER ROW to that deployment's database, and `/goals/draft`
writes nothing else. Use a synthetic address; CLAUDE.md's synthetic-data-only
rule applies to a deployment exactly as it does to a dev machine.

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
import time
from collections import Counter, defaultdict
from pathlib import Path

import httpx

# A Windows console defaults to cp1252, which cannot encode the characters
# this repository writes in prose. Substituting a glyph is a better failure
# than a UnicodeEncodeError traceback out of --help.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):  # pragma: no cover - not a tty
        pass

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
MIN_SITUATED_SHARE = 0.70  # rows that say when or where they happen
# A plan the model called major, appearing on fewer days of the week than
# this, is the reported failure: not present on most of a week the person
# described as a year's work.
#
# ⛔ DAYS OF THE WEEK, NOT DAY-SLOTS. A plan of one daily row plus three
# weekly ones is only 10 slots and is on every day of somebody's week. A
# slot floor high enough to fail the reported plan also fails that one.
# `goal_structuring.WEEK_SHAPE_BY_COMPLEXITY` holds the same number for the
# same reason - keep the two in step.
MAJOR_FLOOR_DAYS = 5


def normalise(text: str) -> str:
    """
    A row reduced to what makes two rows the same row.

    Deliberately crude: case, punctuation and whitespace only. It will not
    notice that "Walk after lunch" and "Take a walk after lunch" are the same
    row, so every repeat figure here is a FLOOR on repetition and never a
    ceiling.
    """
    return re.sub(r"[^a-z0-9 ]+", "", text.lower()).strip()


# ---------------------------------------------------------------------------
# Is a row situated in somebody's day, or is it a habit that fits any goal?
#
# Reported 2026-09-13 alongside the template plans: the rows were "a little too
# vague". The prompt now asks for a row to be CHECKABLE, LOCATED and obvious to
# start, and this is the crude proxy for the middle one.
#
# ⛔ READ WHAT THIS CAN AND CANNOT SEE BEFORE QUOTING IT.
#
# "Drink a glass of water after waking" is a perfectly CONCRETE row that
# answers no goal in particular, and it scores as situated here, because it
# names a moment in a day. That is not a defect in this measure so much as the
# reason a deterministic vagueness check was not built at all: telling a row
# that fits this goal from one that fits every goal is a judgement. Genericness
# is what `repeat_share` and the contrast pairs measure; this measures only
# whether a row says WHEN or WHERE it happens.
#
# So a high figure here is necessary and nowhere near sufficient. A low one is
# the finding worth acting on: rows like "eat better" and "be more active" —
# the goal restated — cannot score.
# ---------------------------------------------------------------------------

# Words that place an activity somewhere in a day or somewhere in a building.
# Lay vocabulary only, and deliberately short: a long list would eventually
# start matching the activity words themselves and report everything as
# situated.
_SITUATING = (
    # when
    "after", "before", "during", "while", "morning", "afternoon", "evening",
    "night", "breakfast", "lunch", "dinner", "bed", "bedtime", "waking",
    "wake", "lunchtime", "weekday", "weekend", "shift", "work",
    # A named day is a moment, and rows do name them - "cook a batch on
    # Sunday". The plan's own `days` field is a separate thing; this is about
    # what the row TEXT says, which is what the person reads on the card.
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
    "sunday",
    # where, and with what
    "office", "desk", "home", "kitchen", "stairs", "lift", "door", "outside",
    "outdoors", "garden", "park", "street", "block", "bus", "train", "car",
    "shop", "walk home", "phone", "kettle", "cupboard", "fridge", "plate",
)


def situated(row: str) -> bool:
    """
    True if the row says when or where it happens.

    Word-boundary matching on a normalised row, so "workout" does not count as
    "work" and "beforehand" does not count as "before".
    """
    words = set(normalise(row).split())
    for term in _SITUATING:
        if " " in term:
            if term in normalise(row):
                return True
        elif term in words:
            return True
    return False


class Outcome:
    """One goal, planned — or not."""

    __slots__ = (
        "goal",
        "title",
        "rows",
        "failure",
        "details",
        "cited",
        "day_counts",
        "days_touched",
        "complexity",
    )

    def __init__(
        self,
        goal: Goal,
        title: str = "",
        rows: tuple[str, ...] = (),
        failure: str = "",
        details: tuple[str, ...] = (),
        cited: tuple[bool, ...] = (),
        day_counts: tuple[int, ...] = (),
        days_touched: int = 0,
        complexity: str = "",
    ):
        self.goal = goal
        self.title = title
        self.rows = rows
        self.failure = failure
        # Parallel to `rows`. A run collected before 2026-09-13 has none of
        # these, which reads as absent rather than as an error - the old
        # baseline is still a valid measurement of the things it did measure.
        self.details = details
        self.cited = cited
        self.day_counts = day_counts
        # ⛔ NOT derivable from `day_counts`. A plan of one daily row and
        # three weekly ones is 10 day-slots and appears on all 7 days; the
        # reported plan is 4 slots on 4 days. Only this separates them, which
        # is why `goal_structuring` enforces its floor on it.
        self.days_touched = days_touched
        self.complexity = complexity

    @property
    def slots(self) -> int:
        """
        How much of the week the plan occupies: one row on one day is one.

        The reported failure was a plan of four rows on four days answering a
        year-long goal, which no count of ROWS can see. Zero means the run
        did not record days, not that the plan had none - see `measure`.
        """
        return sum(self.day_counts)

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
            rows=tuple(a.text for a in result.activities),
            details=tuple((a.detail or "") for a in result.activities),
            cited=tuple(bool(a.evidence_domain) for a in result.activities),
            day_counts=tuple(len(a.days) for a in result.activities),
            days_touched=len({d for a in result.activities for d in a.days}),
            complexity=result.complexity or "",
        )
    if isinstance(result, goal_structuring.Refusal):
        return Outcome(goal, failure=f"refused ({result.reason})")
    if isinstance(result, goal_structuring.Busy):
        return Outcome(goal, failure="rate limited")
    return Outcome(goal, failure="no plan (endpoint or check)")


# ---------------------------------------------------------------------------
# Collecting plans from a deployment, for a run that needs no local key.
# ---------------------------------------------------------------------------


def outcome_from_draft(goal: Goal, status_code: int, payload: dict) -> Outcome:
    """
    One POST /goals/draft response, read as an Outcome.

    Split out from the request so it can be tested without a network, which is
    most of what could silently go wrong here: a run whose plans all failed
    must not be able to read as a run with no repetition in it.
    """
    if status_code != 200:
        return Outcome(goal, failure=f"HTTP {status_code}")

    activities = [a for a in (payload.get("activities") or ()) if a.get("text")]
    rows = tuple(a["text"] for a in activities)
    details = tuple((a.get("detail") or "") for a in activities)
    cited = tuple(bool(a.get("evidence")) for a in activities)
    day_counts = tuple(len(a.get("days") or ()) for a in activities)
    days_touched = len({d for a in activities for d in (a.get("days") or ())})
    if not rows:
        # `notice` is the sentence the person would have read, and out here it
        # is the only thing separating a refusal from an outage from a rate
        # limit - so it is carried through verbatim.
        if payload.get("emergency"):
            return Outcome(goal, failure="emergency guidance instead of a plan")
        return Outcome(goal, failure=payload.get("notice") or "no plan, no notice")

    return Outcome(
        goal,
        title=payload.get("title") or "",
        rows=rows,
        details=details,
        cited=cited,
        day_counts=day_counts,
        days_touched=days_touched,
        complexity=payload.get("complexity") or "",
    )


class Deployment:
    """
    A signed-in client for POST /goals/draft.

    ⛔ It reads `title` and `activities[].text` and nothing else. It never
    saves a goal — `/goals/draft` writes nothing, which is the property that
    makes measuring a live deployment defensible at all.
    """

    def __init__(
        self,
        base_url: str,
        email: str,
        password: str,
        pause: float,
        retries: int = 2,
        retry_pause: float = 20.0,
    ):
        self.base = base_url.rstrip("/")
        self.pause = pause
        self.retries = retries
        self.retry_pause = retry_pause
        self.client = httpx.Client(timeout=120)
        self.token = self._sign_in(email, password)

    def _sign_in(self, email: str, password: str) -> str:
        body = {"email": email, "password": password}

        # Sign up first, and treat "already registered" as success. The API
        # discloses that deliberately (CLAUDE.md, "Sign-in"), so re-running
        # this script does not need a fresh address every time.
        created = self.client.post(f"{self.base}/auth/signup", json=body)
        if created.status_code not in (201, 400):
            raise SystemExit(
                f"signup failed: HTTP {created.status_code} {created.text[:200]}"
            )

        token = self.client.post(f"{self.base}/auth/login", json=body)
        if token.status_code != 200:
            raise SystemExit(
                f"login failed: HTTP {token.status_code} {token.text[:200]}"
            )
        return token.json()["access_token"]

    def _once(self, goal: Goal) -> Outcome:
        response = self.client.post(
            f"{self.base}/goals/draft",
            json={"description": goal.text},
            headers={"Authorization": f"Bearer {self.token}"},
        )
        payload = {} if response.status_code != 200 else response.json()
        return outcome_from_draft(goal, response.status_code, payload)

    def draft(self, goal: Goal) -> Outcome:
        """
        One goal, retried while it comes back with no plan.

        ⛔ THE FIRST BASELINE RUN LOST HALF ITS SAMPLE TO A RATE LIMIT. Eight
        of sixteen goals returned "MedHelp is busy right now" against a free
        tier at four seconds apart, which is not a measurement, it is a
        measurement of the quota.

        It retries ANY empty answer rather than reading the notice for the
        word "busy". A refusal will simply refuse again for the price of one
        call, and matching on user-facing copy would make the harness break
        the next time that sentence is reworded.
        """
        outcome = self._once(goal)

        for _ in range(self.retries):
            if outcome.planned:
                break
            time.sleep(self.retry_pause)
            outcome = self._once(goal)

        time.sleep(self.pause)
        return outcome


# How much of the SHORTER row has to appear in the longer one for the two to
# count as the same row reworded.
#
# ⛔ Containment, not Jaccard, and that is not a detail. "Take a 10-minute walk
# after breakfast" and "Take a 5-minute walk outside" share three words out of
# a combined eight — a Jaccard of 0.38, under any threshold loose enough to be
# safe — while the shorter row is 60% inside the longer. Jaccard punishes a row
# for carrying extra context, which is exactly how a template row disguises
# itself: same instruction, more trimmings.
NEAR_DUPLICATE = 0.6

# Below this many words a row is too short for containment to mean anything:
# "Walk the dog" is two content words and would match half the corpus.
MIN_TOKENS_FOR_NEAR = 3

# ⛔ CONTAINMENT ALONE FOLDED "walk the dog" INTO "walk around the office for
# five minutes" — two shared tokens out of three, and one of them was "the".
# So a fold also needs this many shared words that are not function words.
# The list is short on purpose: dropping function words from the containment
# ratio itself was tried and broke the real matches, because a short row is
# mostly function words and the ratio then has almost nothing left to divide.
MIN_SHARED_CONTENT = 2

_FUNCTION_WORDS = frozenset(
    {"a", "an", "the", "of", "to", "for", "and", "or", "your", "you", "then"}
)


def tokens(text: str) -> frozenset[str]:
    return frozenset(normalise(text).split())


def near(a: str, b: str) -> bool:
    """Whether two rows are the same row reworded."""
    left, right = tokens(a), tokens(b)
    if not left or not right:
        return False

    shorter = min(len(left), len(right))
    if shorter < MIN_TOKENS_FOR_NEAR:
        return left == right

    shared = left & right
    if len(shared - _FUNCTION_WORDS) < MIN_SHARED_CONTENT:
        return False
    return (len(shared) / shorter) >= NEAR_DUPLICATE


def soft_overlap(rows_a: set[str], rows_b: set[str]) -> float:
    """
    Jaccard, counting a row as present in both sets when it has a near-match.

    ⛔ THE EXACT FIGURE UNDERSTATED THE BUG THIS HARNESS WAS BUILT FOR. The
    first clean baseline scored the two smoking goals at 0% overlap while
    their plans were walk / water / breathing break / call a friend on both
    sides, reworded. A metric that reports the reported bug as absent is worse
    than no metric, so both numbers are now printed and the soft one is what
    --strict reads.
    """
    shared = sum(1 for row in rows_a if any(near(row, other) for other in rows_b))
    union = len(rows_a) + len(rows_b) - shared
    return (shared / union) if union else 0.0


def save(outcomes: list[Outcome], path: Path, label: str, source: str) -> None:
    """
    The collected plans, so a run costs its quota once.

    ⛔ Collecting is the expensive, rate-limited, non-reproducible half and
    measuring is the cheap half. Keeping them apart is what let the metric be
    corrected after a baseline had already been taken, without paying for the
    baseline twice.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "label": label,
                "source": source,
                "outcomes": [
                    {
                        "goal": o.goal.id,
                        "title": o.title,
                        "rows": list(o.rows),
                        "details": list(o.details),
                        "cited": list(o.cited),
                        "day_counts": list(o.day_counts),
                        "days_touched": o.days_touched,
                        "complexity": o.complexity,
                        "failure": o.failure,
                    }
                    for o in outcomes
                ],
            },
            indent=2,
        ),
        encoding="utf-8",
    )


def load(path: Path) -> tuple[list[Outcome], str, str]:
    """Plans collected earlier, read back as Outcomes."""
    saved = json.loads(path.read_text(encoding="utf-8"))
    by_id = {goal.id: goal for goal in CORPUS}

    outcomes = []
    for entry in saved["outcomes"]:
        goal = by_id.get(entry["goal"])
        if goal is None:
            # The corpus has moved on. Dropping it silently would change a
            # metric without anything saying so.
            raise SystemExit(
                f"{path.name} names a goal the corpus no longer has: "
                f"{entry['goal']!r}"
            )
        outcomes.append(
            Outcome(
                goal,
                title=entry.get("title") or "",
                rows=tuple(entry.get("rows") or ()),
                details=tuple(entry.get("details") or ()),
                cited=tuple(entry.get("cited") or ()),
                day_counts=tuple(entry.get("day_counts") or ()),
                days_touched=entry.get("days_touched") or 0,
                complexity=entry.get("complexity") or "",
                failure=entry.get("failure") or "",
            )
        )
    return outcomes, saved.get("label", ""), saved.get("source", "")


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
            "soft_overlap": soft_overlap(a, b),
            "shared_rows": sorted(a & b),
            "near_rows": sorted(
                f"{row}  ~  {other}"
                for row in a
                for other in b
                if row not in b and near(row, other)
            ),
            "goals": [h.goal.id for h in halves],
            "note": members[0].note + " / " + members[1].note,
        }

    anchored = [o for o in planned if o.goal.anchors]
    anchor_hits = [o for o in anchored if o.anchors_hit]

    # "Very detailed and proven", counted. Neither says a plan is good: a
    # detail can be vague and a citation can be attached to the wrong row.
    # They say whether the feature is doing the thing at all, which is the
    # question a prompt cannot answer about itself.
    detailed = sum(1 for o in planned for d in o.details if d.strip())
    with_citation = sum(1 for o in planned for flag in o.cited if flag)
    in_a_day = sum(1 for row in rows if situated(row))

    # How much of a week each plan occupies, which is the half of "sized to
    # the goal" that a row count cannot see. The reported plan was four rows
    # on four days answering a year-long goal: five rows would not have made
    # it a fuller week, and four daily rows would have.
    #
    # Only runs that recorded days are counted. A run collected before
    # 2026-09-13 has none, and reporting those as a coverage of zero would
    # read as a finding about the plans rather than about the run.
    # Where a goal states its own scale, did the plan take it? `ORDER` is
    # the planner's own ordering, so this compares like with like.
    ORDER = {"small": 0, "moderate": 1, "major": 2}
    misread = []
    for outcome in planned:
        read_as = ORDER.get(outcome.complexity)
        if read_as is None:
            continue  # not recorded by this run
        floor, ceiling = outcome.goal.not_below, outcome.goal.not_above
        if floor and read_as < ORDER[floor]:
            misread.append(
                f"{outcome.goal.id}: read as {outcome.complexity}, "
                f"and the goal states a scale no smaller than {floor}"
            )
        if ceiling and read_as > ORDER[ceiling]:
            misread.append(
                f"{outcome.goal.id}: read as {outcome.complexity}, "
                f"and the goal states a scale no larger than {ceiling}"
            )

    scheduled = [o for o in planned if o.day_counts]
    by_complexity: dict[str, list[tuple[int, int]]] = {}
    for outcome in scheduled:
        by_complexity.setdefault(outcome.complexity or "unstated", []).append(
            (outcome.slots, outcome.days_touched)
        )

    near_repeats = sorted(
        {
            row
            for row, ids in goals_per_row.items()
            for other, other_ids in goals_per_row.items()
            if row < other and not (ids & other_ids) and near(row, other)
        }
    )

    return {
        "goals": len(outcomes),
        "near_repeat_rows": near_repeats,
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
        "detail_share": (detailed / len(rows)) if rows else 0.0,
        "citation_share": (with_citation / len(rows)) if rows else 0.0,
        "situated_share": (in_a_day / len(rows)) if rows else 0.0,
        "unsituated_rows": sorted({row for row in rows if not situated(row)}),
        "anchor_share": (len(anchor_hits) / len(anchored)) if anchored else 0.0,
        "anchor_misses": [o.goal.id for o in anchored if not o.anchors_hit],
        "scheduled": len(scheduled),
        "mean_slots": (
            sum(o.slots for o in scheduled) / len(scheduled) if scheduled else 0.0
        ),
        "mean_days_touched": (
            sum(o.days_touched for o in scheduled) / len(scheduled)
            if scheduled
            else 0.0
        ),
        "slots_by_complexity": {
            name: {
                "plans": len(values),
                "mean": sum(slots for slots, _ in values) / len(values),
                "fewest": min(slots for slots, _ in values),
                "mean_days": sum(days for _, days in values) / len(values),
                "fewest_days": min(days for _, days in values),
            }
            for name, values in sorted(by_complexity.items())
        },
        # Goals whose stated scale the plan did not take: a year-long,
        # tried-and-stopped goal read as anything less than major, or a
        # single-day goal read as major. ⛔ Bounds only, from the corpus, and
        # only where the goal says its own size out loud — see corpus.Goal.
        "misread_size": misread,
        # A plan that read its goal as major and then filled four days of the
        # week is the reported failure. It cannot reach a person any more —
        # `_validate_plan` discards it — so a name here means either an old
        # run or a deployment without the check.
        "thin_major_plans": [
            o.goal.id
            for o in scheduled
            if o.complexity == "major" and o.days_touched < MAJOR_FLOOR_DAYS
        ],
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
        # The soft figure, because the exact one scored the reported bug 0%.
        if data["soft_overlap"] > MAX_PAIR_OVERLAP:
            found.append(
                f"contrast pair {pair_id} overlaps {data['soft_overlap']:.0%} "
                f"counting rewordings (exact {data['overlap']:.0%}, threshold "
                f"{MAX_PAIR_OVERLAP:.0%}): {data['note']}"
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
    if report["rows_total"] and report["situated_share"] < MIN_SITUATED_SHARE:
        found.append(
            f"only {report['situated_share']:.0%} of rows say when or where "
            f"they happen (threshold {MIN_SITUATED_SHARE:.0%}); the vaguest: "
            + ", ".join(report["unsituated_rows"][:4])
        )
    # ⛔ A metric nobody fails on is a metric nobody reads. The coverage figures
    # were reported and not gated when they were added, which would have let
    # the reported bug pass a --strict run in silence.
    if report["misread_size"]:
        found.append(
            "plans that ignored a scale the goal stated outright: "
            + "; ".join(report["misread_size"])
        )
    if report["thin_major_plans"]:
        found.append(
            f"plans read as major appearing on under {MAJOR_FLOOR_DAYS} days "
            f"of the week (not present on most of a long goal's week): "
            + ", ".join(report["thin_major_plans"])
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
    print(f"  rows saying how          {report['detail_share']:.1%}")
    print(f"  rows with a citation     {report['citation_share']:.1%}")
    print(f"  plans using a goal word  {report['anchor_share']:.1%}")
    print(f"  rows saying when/where   {report['situated_share']:.1%}")
    if report["scheduled"]:
        print(f"  day-slots per plan       {report['mean_slots']:.1f} mean")
        print(f"  days of the week on      {report['mean_days_touched']:.1f} mean")
    print()

    # How much of a week a plan fills, by the size the planner read the goal
    # as. A run from before 2026-09-13 recorded no days and prints nothing.
    if report["slots_by_complexity"]:
        print("  HOW MUCH OF A WEEK A PLAN FILLS")
        print("    (slots: one row on one day.  days: distinct days it is on)")
        for name, data in report["slots_by_complexity"].items():
            print(
                f"    {name:<10} {data['plans']:>2} plans"
                f"   slots {data['mean']:>5.1f} (min {data['fewest']:>2})"
                f"   days {data['mean_days']:>4.1f} (min {data['fewest_days']})"
            )
        if report["thin_major_plans"]:
            print(
                "    ⛔ major goals answered on under 14 day-slots: "
                + ", ".join(report["thin_major_plans"])
            )
        print()

    if report["misread_size"]:
        print("  THE GOAL SAID ITS OWN SIZE AND THE PLAN DID NOT TAKE IT")
        for line in report["misread_size"]:
            print(f"    {line}")
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
        print(
            f"    {pair_id:<16} overlap {data['soft_overlap']:.0%} counting "
            f"rewordings, {data['overlap']:.0%} exact   {data['note']}"
        )
        for row in data["shared_rows"]:
            print(f"        shared:   {row}")
        for row in data["near_rows"]:
            print(f"        reworded: {row}")
    print()

    if report["near_repeat_rows"]:
        print("  ROWS REWORDED ONTO ANOTHER GOAL  (the exact matcher misses these)")
        for row in report["near_repeat_rows"]:
            print(f"    {row}")
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
    parser.add_argument(
        "--api",
        metavar="BASE_URL",
        help=(
            "measure a deployment instead of this working copy, by posting "
            "each goal to its POST /goals/draft"
        ),
    )
    parser.add_argument("--email", help="account to use with --api (synthetic)")
    parser.add_argument("--password", help="its password")
    parser.add_argument(
        "--pause",
        type=float,
        default=8.0,
        help="seconds between --api requests, to stay inside a free-tier quota",
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=2,
        help="re-attempts for a goal that came back with no plan (--api only)",
    )
    parser.add_argument(
        "--retry-pause",
        type=float,
        default=20.0,
        help="seconds to wait before such a re-attempt",
    )
    parser.add_argument(
        "--save",
        metavar="PATH",
        help="write the collected plans to a JSON file for later --load",
    )
    parser.add_argument(
        "--load",
        metavar="PATH",
        help=(
            "measure plans collected by an earlier --save instead of calling "
            "a model at all"
        ),
    )
    parser.add_argument(
        "--label",
        default="",
        help="a name for this run, printed above the numbers",
    )
    args = parser.parse_args()

    if args.load:
        outcomes, saved_label, source = load(Path(args.load))
        label = args.label or saved_label
    else:
        if args.api:
            if not (args.email and args.password):
                print("--api needs --email and --password.", file=sys.stderr)
                return 2
            source = f"{args.api} (the DEPLOYED code, not this working copy)"
            collect = Deployment(
                args.api,
                args.email,
                args.password,
                args.pause,
                retries=args.retries,
                retry_pause=args.retry_pause,
            ).draft
        else:
            if not goal_structuring.available():
                print(
                    "No goals model endpoint is configured, so there is "
                    "nothing to measure. Set GROQ_API_KEY (or the GOALS_LLM_* "
                    "settings) - see docs/free-model-setup.md - or measure a "
                    "deployment with --api, or re-measure a saved run with "
                    "--load.",
                    file=sys.stderr,
                )
                return 2
            endpoint = llm.goals_endpoint()
            local = "local" if llm.endpoint_is_local(endpoint) else "REMOTE"
            source = (
                f"in process: {endpoint.model} ({local}), "
                f"temperature {goal_structuring.PLAN_TEMPERATURE}"
            )
            collect = plan

        label = args.label
        outcomes = [collect(goal) for goal in CORPUS]

        if args.save:
            save(outcomes, Path(args.save), label, source)

    if not args.json:
        print()
        if label:
            print(f"run: {label}")
        print(f"source: {source}")

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
