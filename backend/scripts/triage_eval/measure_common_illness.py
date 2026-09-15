"""
Runs the 10,000-case common-illness corpus through the rule layer.

    cd backend
    python scripts/triage_eval/measure_common_illness.py
    python scripts/triage_eval/measure_common_illness.py --failures
    python scripts/triage_eval/measure_common_illness.py --presentation stroke
    python scripts/triage_eval/measure_common_illness.py --json

Companion to `measure.py`, which scores the smaller hand-written corpus. This
one scores breadth: 236 common American presentations, each in several lay
phrasings, each wrapped in ordinary conversational framing, each surfaced the
way text actually arrives (curly apostrophes, block capitals, hurried spacing,
pasted clauses run together).

## ⛔ What a number from this establishes, and what it does not

Exactly what `measure.py` establishes and no more. Gold labels are **this
app's own documented intent**, assigned by a software engineer. It measures
consistency with that intent and regression against it. It is **not** clinical
validation, neither the labels nor the tier definitions they encode have been
read by a clinician, and no figure from it may be reported as clinical
accuracy. The release blocker in CLAUDE.md is untouched by anything here.

What it is genuinely good for: finding the places where a description a real
person would write reaches the wrong tier, and telling you whether a change to
the phrase lists moved that number up, down, or not at all.

## Metrics

Same vignette-evaluation names as `measure.py`, so the two are comparable:
safety of advice, under-triage, over-triage, exact agreement, rule coverage.
Plus two this corpus adds:

* by surface   — every metric split by how the text arrived. A gap between
                 `plain` and `shout` is a matcher bug, not a phrase-list gap,
                 and the two need different fixes.
* by presentation — which illnesses fail, so a fix can be aimed.

SYNTHETIC INPUT ONLY.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent))  # backend/, so `app.*` resolves
sys.path.insert(0, str(HERE))  # so `common_illness` resolves

from app.core import rules_triage  # noqa: E402

from common_illness import CASES, TIER_RANK, TIERS, Case, build_all  # noqa: E402


class Outcome:
    __slots__ = ("case", "predicted", "defaulted", "rules_fired")

    def __init__(self, case: Case, predicted: str, defaulted: bool, rules_fired: list[str]):
        self.case = case
        self.predicted = predicted
        self.defaulted = defaulted
        self.rules_fired = rules_fired

    @property
    def gold(self) -> str:
        return self.case.gold

    @property
    def delta(self) -> int:
        """Positive = over-triaged, negative = under-triaged, 0 = exact."""
        return TIER_RANK[self.predicted] - TIER_RANK[self.case.gold]


def run(cases: list[Case]) -> list[Outcome]:
    out: list[Outcome] = []
    for case in cases:
        result = rules_triage.classify(case.description)
        out.append(
            Outcome(
                case=case,
                predicted=result.tier_name,
                defaulted=result.defaulted,
                rules_fired=[m.rule_id for m in result.matches],
            )
        )
    return out


def _pct(n: int, d: int) -> str:
    return "  n/a" if d == 0 else f"{100.0 * n / d:5.1f}%"


def _block(title: str, outcomes: list[Outcome]) -> list[str]:
    total = len(outcomes)
    if total == 0:
        return [f"  {title}  (n=0)"]
    exact = sum(1 for o in outcomes if o.delta == 0)
    under = sum(1 for o in outcomes if o.delta < 0)
    over = sum(1 for o in outcomes if o.delta > 0)
    defaulted = sum(1 for o in outcomes if o.defaulted)
    gold_em = [o for o in outcomes if o.gold == "EMERGENT"]
    caught = [o for o in gold_em if o.predicted == "EMERGENT"]
    gold_sc = [o for o in outcomes if o.gold == "SELF_CARE"]
    earned = [o for o in gold_sc if o.predicted == "SELF_CARE"]
    return [
        f"  {title}  (n={total})",
        f"    exact agreement      {_pct(exact, total)}   {exact}/{total}",
        f"    under-triaged        {_pct(under, total)}   {under}/{total}",
        f"    over-triaged         {_pct(over, total)}   {over}/{total}",
        f"    safety of advice     {_pct(len(caught), len(gold_em))}   "
        f"{len(caught)}/{len(gold_em)} gold-EMERGENT caught",
        f"    rule coverage        {_pct(total - defaulted, total)}   "
        f"{total - defaulted}/{total} recognised, {defaulted} defaulted",
        f"    self-care earned     {_pct(len(earned), len(gold_sc))}   "
        f"{len(earned)}/{len(gold_sc)} gold-SELF_CARE",
        "",
    ]


def report(outcomes: list[Outcome], show_failures: bool, limit: int) -> str:
    lines: list[str] = [
        "=" * 74,
        " Common-illness corpus — 10,000 cases through the rule layer",
        "=" * 74,
        " Measures consistency with this app's DOCUMENTED INTENT, not clinical",
        " accuracy. Gold labels and tier definitions were both written by a",
        " software engineer and neither is clinician-reviewed. Do not report a",
        " number from this script as validation. See common_illness/presentations.py.",
        "",
        "-" * 74,
        " OVERALL",
        "-" * 74,
    ]
    lines += _block("all cases", outcomes)
    lines += _block(
        "natural phrasing only", [o for o in outcomes if o.case.natural]
    )

    lines += ["-" * 74, " BY SURFACE FORM", "-" * 74]
    by_surface: dict[str, list[Outcome]] = defaultdict(list)
    for o in outcomes:
        by_surface[o.case.surface].append(o)
    for surface in ("plain", "curly", "shout", "messy", "glued"):
        lines += _block(surface, by_surface.get(surface, []))

    lines += ["-" * 74, " CONFUSION MATRIX  (rows = gold, columns = returned)", "-" * 74]
    matrix: Counter[tuple[str, str]] = Counter(
        (o.gold, o.predicted) for o in outcomes
    )
    lines.append("      " + "".join(f"{t:>12}" for t in TIERS) + f"{'total':>12}")
    for gold in TIERS:
        row = [matrix[(gold, p)] for p in TIERS]
        lines.append(f"  {gold:<10}" + "".join(f"{v:>12}" for v in row) + f"{sum(row):>12}")
    lines.append("")

    under = [o for o in outcomes if o.delta < 0]
    over = [o for o in outcomes if o.delta > 0]

    lines += ["-" * 74, f" UNDER-TRIAGED BY PRESENTATION  ({len(under)} cases)", "-" * 74]
    by_pres: Counter[str] = Counter(o.case.presentation for o in under)
    totals: Counter[str] = Counter(o.case.presentation for o in outcomes)
    if not by_pres:
        lines.append("    none")
    for key, n in by_pres.most_common(40):
        label = next(o.case.label for o in under if o.case.presentation == key)
        gold = next(o.case.gold for o in under if o.case.presentation == key)
        got = Counter(
            o.predicted for o in under if o.case.presentation == key
        ).most_common(1)[0][0]
        lines.append(
            f"    {n:>5}/{totals[key]:<5} {label:<34} gold {gold:<10} got {got}"
        )
    lines.append("")

    lines += ["-" * 74, f" OVER-TRIAGED BY PRESENTATION  ({len(over)} cases)", "-" * 74]
    by_pres_o: Counter[str] = Counter(o.case.presentation for o in over)
    if not by_pres_o:
        lines.append("    none")
    for key, n in by_pres_o.most_common(40):
        label = next(o.case.label for o in over if o.case.presentation == key)
        gold = next(o.case.gold for o in over if o.case.presentation == key)
        got = Counter(
            o.predicted for o in over if o.case.presentation == key
        ).most_common(1)[0][0]
        lines.append(
            f"    {n:>5}/{totals[key]:<5} {label:<34} gold {gold:<10} got {got}"
        )
    lines.append("")

    if show_failures:
        lines += ["-" * 74, " FAILING DESCRIPTIONS", "-" * 74]
        for o in (under + over)[:limit]:
            arrow = "UNDER" if o.delta < 0 else "OVER "
            lines.append(
                f"    [{arrow}] gold {o.gold:<10} got {o.predicted:<10} "
                f"[{o.case.surface}] {o.case.description!r}"
            )
        lines.append("")

    lines += ["-" * 74, " RULES THAT FIRED", "-" * 74]
    fired: Counter[str] = Counter()
    for o in outcomes:
        fired.update(o.rules_fired)
    for rule, n in fired.most_common():
        lines.append(f"    {n:>6}  {rule}")
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--failures", action="store_true", help="list failing descriptions")
    ap.add_argument("--limit", type=int, default=120)
    ap.add_argument("--presentation", help="only this presentation key")
    ap.add_argument(
        "--all",
        action="store_true",
        help="score the full cross product, not the selected 10,000",
    )
    ap.add_argument("--strict", action="store_true", help="exit 1 on any failure")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    cases = build_all() if args.all else CASES
    if args.presentation:
        cases = [c for c in cases if c.presentation == args.presentation]
        if not cases:
            print(f"no presentation {args.presentation!r}", file=sys.stderr)
            return 2

    all_outcomes = run(cases)
    # Documented gaps are held out of the scores and printed in full below,
    # the same way corpus.py/measure.py handle theirs. A known, reported,
    # unfixed gap is not a regression and must not be averaged into one — but
    # it must stay visible, so it is never merely dropped.
    gaps = [o for o in all_outcomes if o.case.documented_gap]
    outcomes = [o for o in all_outcomes if not o.case.documented_gap]

    if args.json:
        print(
            json.dumps(
                {
                    "total": len(outcomes),
                    "exact": sum(1 for o in outcomes if o.delta == 0),
                    "under": sum(1 for o in outcomes if o.delta < 0),
                    "over": sum(1 for o in outcomes if o.delta > 0),
                    "under_by_presentation": Counter(
                        o.case.presentation for o in outcomes if o.delta < 0
                    ),
                    "over_by_presentation": Counter(
                        o.case.presentation for o in outcomes if o.delta > 0
                    ),
                },
                indent=2,
            )
        )
        return 0

    print(report(outcomes, args.failures, args.limit))

    if gaps:
        still_open = [o for o in gaps if o.delta != 0]
        print("\n" + "-" * 74)
        print(
            f" DOCUMENTED GAPS  ({len(gaps)} cases, "
            f"{len(still_open)} still open)  -- excluded from the scores above"
        )
        print("-" * 74)
        reasons: dict[str, int] = defaultdict(int)
        for o in gaps:
            if o.delta != 0:
                reasons[o.case.documented_gap] += 1
        for reason, n in sorted(reasons.items(), key=lambda kv: -kv[1]):
            print(f"    {n:>5}  OPEN    {reason}")
        if len(still_open) < len(gaps):
            print(f"    {len(gaps) - len(still_open):>5}  CLOSED  now reaching gold")
        for o in still_open[:8]:
            print(f"            gold {o.gold:<10} got {o.predicted:<10} {o.case.description!r}")

    if args.strict:
        failures = [o for o in outcomes if o.delta != 0]
        if failures:
            print(f"\nSTRICT: {len(failures)} case(s) did not match gold.")
            return 1
        print(f"\nSTRICT: all {len(outcomes)} cases match gold.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
