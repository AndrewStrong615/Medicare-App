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

    rows = tuple(
        a["text"] for a in (payload.get("activities") or ()) if a.get("text")
    )
    if not rows:
        # `notice` is the sentence the person would have read, and out here it
        # is the only thing separating a refusal from an outage from a rate
        # limit - so it is carried through verbatim.
        if payload.get("emergency"):
            return Outcome(goal, failure="emergency guidance instead of a plan")
        return Outcome(goal, failure=payload.get("notice") or "no plan, no notice")

    return Outcome(goal, title=payload.get("title") or "", rows=rows)


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
