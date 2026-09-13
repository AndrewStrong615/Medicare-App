"""
Measures the rule layer's triage against the synthetic corpus in corpus.py.

    cd backend
    python scripts/triage_eval/measure.py
    python scripts/triage_eval/measure.py --label "concept combinator"
    python scripts/triage_eval/measure.py --strict     # non-zero exit on any
                                                       # unexpected under-triage
    python scripts/triage_eval/measure.py --json

WHY THIS EXISTS: CLAUDE.md's release blocker says the classifier "has no
validated error profile ... nobody has measured its under-triage rate", and
that "biased safe is not the same as measured safe". This script is the
measurement. It is modelled on scripts/topic_retrieval_eval/measure.py, which
is what let the retrieval numbers in CLAUDE.md be reported rather than
asserted.

It runs the real `rules_triage.classify` — no model, no network, no key — so
every run is free, offline and reproducible for a given corpus.

## ⛔ What this does and does not establish

It measures **consistency with this app's own documented intent**, and
regression against it. It is not clinical validation and its output must never
be described as clinical accuracy: the gold labels and the tier definitions
they encode were both written by a software engineer and neither has been
reviewed by a clinician. See the note at the top of corpus.py.

The metric names follow the published vignette-based evaluation standard for
symptom checkers, so the numbers are comparable to the literature rather than
homemade:

* safety of advice   — share of gold-EMERGENT cases correctly returned
                       EMERGENT. The number that matters most.
* under-triage       — share returned LOWER than gold. Every one is listed.
* over-triage        — share returned HIGHER than gold. The safe direction,
                       and this architecture deliberately biases into it.
* exact agreement    — share returned exactly gold.

Two further numbers are specific to this app's design:

* rule coverage      — share where a rule actually recognised something,
                       i.e. 1 - (defaulted share). The default is URGENT, so
                       a low coverage figure means the app is mostly declining
                       to classify rather than classifying. This is the
                       ceiling on how often SELF_CARE can ever be earned.
* natural phrasing   — every metric above, restricted to descriptions phrased
                       the way a person writes rather than copied from the
                       phrase lists. Treat these as the real figures; matching
                       your own list is trivially easy.

SYNTHETIC INPUT ONLY. Nothing here leaves the machine, but never paste
anything a real person wrote into corpus.py.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
# backend/ , so that `app.*` resolves however this is invoked.
sys.path.insert(0, str(HERE.parent.parent))

from app.core import rules_triage  # noqa: E402

from corpus import CASES, TIER_RANK, TIERS, Case  # noqa: E402


GAP_PREFIX = "documented gap"


class Outcome:
    """One case, classified."""

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
        return TIER_RANK[self.predicted] - TIER_RANK[self.gold]

    @property
    def is_gap(self) -> bool:
        return self.case.basis.startswith(GAP_PREFIX)

    @property
    def gap_closed(self) -> bool:
        """
        A documented gap is closed only when the tier is EXACTLY gold.

        Not `delta >= 0`: an all-caps glued list of cold symptoms that
        over-triages to URGENT has still not been recognised, and reporting
        that as closed would hide the gap behind the safe default.
        """
        return self.delta == 0


def run(cases: list[Case]) -> list[Outcome]:
    outcomes: list[Outcome] = []
    for case in cases:
        result = rules_triage.classify(case.description)
        outcomes.append(
            Outcome(
                case=case,
                predicted=result.tier_name,
                defaulted=result.defaulted,
                rules_fired=[m.rule_id for m in result.matches],
            )
        )
    return outcomes


def _pct(n: int, d: int) -> str:
    return "  n/a" if d == 0 else f"{100.0 * n / d:5.1f}%"


def summarise(outcomes: list[Outcome]) -> dict[str, object]:
    total = len(outcomes)
    exact = sum(1 for o in outcomes if o.delta == 0)
    under = [o for o in outcomes if o.delta < 0]
    over = [o for o in outcomes if o.delta > 0]
    defaulted = sum(1 for o in outcomes if o.defaulted)

    gold_emergent = [o for o in outcomes if o.gold == "EMERGENT"]
    caught_emergent = [o for o in gold_emergent if o.predicted == "EMERGENT"]

    gold_self_care = [o for o in outcomes if o.gold == "SELF_CARE"]
    earned_self_care = [o for o in gold_self_care if o.predicted == "SELF_CARE"]

    return {
        "total": total,
        "exact": exact,
        "under": len(under),
        "over": len(over),
        "defaulted": defaulted,
        "coverage": total - defaulted,
        "gold_emergent": len(gold_emergent),
        "safety_of_advice": len(caught_emergent),
        "gold_self_care": len(gold_self_care),
        "self_care_earned": len(earned_self_care),
    }


def _print_block(title: str, outcomes: list[Outcome]) -> None:
    s = summarise(outcomes)
    total = s["total"]
    print(f"  {title}  (n={total})")
    if total == 0:
        print("    nothing in this slice")
        return
    print(f"    exact agreement      {_pct(s['exact'], total)}   {s['exact']}/{total}")
    print(f"    under-triaged        {_pct(s['under'], total)}   {s['under']}/{total}")
    print(f"    over-triaged         {_pct(s['over'], total)}   {s['over']}/{total}")
    print(
        f"    safety of advice     {_pct(s['safety_of_advice'], s['gold_emergent'])}"
        f"   {s['safety_of_advice']}/{s['gold_emergent']} gold-EMERGENT caught"
    )
    print(
        f"    rule coverage        {_pct(s['coverage'], total)}"
        f"   {s['coverage']}/{total} recognised, {s['defaulted']} defaulted"
    )
    print(
        f"    self-care earned     {_pct(s['self_care_earned'], s['gold_self_care'])}"
        f"   {s['self_care_earned']}/{s['gold_self_care']} gold-SELF_CARE"
    )
    print()


def print_report(outcomes: list[Outcome], label: str | None) -> None:
    print()
    print("=" * 72)
    print(" Triage rule-layer measurement" + (f" -- {label}" if label else ""))
    print("=" * 72)
    print(
        " Measures consistency with this app's DOCUMENTED INTENT, not clinical\n"
        " accuracy. Gold labels and tier definitions were both written by a\n"
        " software engineer and neither is clinician-reviewed. Do not report a\n"
        " number from this script as validation. See corpus.py."
    )
    print()

    scored = [o for o in outcomes if not o.is_gap]
    gaps = [o for o in outcomes if o.is_gap]

    print("-" * 72)
    print(" OVERALL")
    print("-" * 72)
    _print_block("all scored cases", scored)
    _print_block("natural phrasing only", [o for o in scored if o.case.natural])
    _print_block("copied from the phrase lists", [o for o in scored if not o.case.natural])

    # --- confusion matrix -------------------------------------------------
    print("-" * 72)
    print(" CONFUSION MATRIX  (rows = gold, columns = returned)")
    print("-" * 72)
    matrix: Counter[tuple[str, str]] = Counter(
        (o.gold, o.predicted) for o in scored
    )
    header = "".join(f"{t:>12}" for t in TIERS)
    print(f"    {'':<12}{header}      total")
    for gold in TIERS:
        row = "".join(f"{matrix[(gold, pred)]:>12}" for pred in TIERS)
        row_total = sum(matrix[(gold, pred)] for pred in TIERS)
        print(f"    {gold:<12}{row}{row_total:>11}")
    print()

    # --- under-triage, in full -------------------------------------------
    under = [o for o in scored if o.delta < 0]
    print("-" * 72)
    print(f" UNDER-TRIAGED  ({len(under)})  -- the failures that matter")
    print("-" * 72)
    if not under:
        print("    none")
    for o in under:
        print(f"    gold {o.gold:<10} got {o.predicted:<10} {o.case.description!r}")
        print(f"        basis: {o.case.basis}")
        if o.rules_fired:
            print(f"        rules fired: {', '.join(o.rules_fired)}")
    print()

    # --- over-triage, summarised -----------------------------------------
    over = [o for o in scored if o.delta > 0]
    print("-" * 72)
    print(f" OVER-TRIAGED  ({len(over)})  -- the safe direction, by design")
    print("-" * 72)
    if not over:
        print("    none")
    for o in over:
        why = "safe default" if o.defaulted else ", ".join(o.rules_fired)
        print(f"    gold {o.gold:<10} got {o.predicted:<10} {o.case.description!r}")
        print(f"        why: {why}")
    print()

    # --- documented gaps --------------------------------------------------
    print("-" * 72)
    print(f" DOCUMENTED GAPS  ({len(gaps)})  -- excluded from the scores above")
    print("-" * 72)
    for o in gaps:
        state = "CLOSED" if o.gap_closed else "OPEN  "
        print(f"    [{state}] gold {o.gold:<10} got {o.predicted:<10} {o.case.description!r}")
        print(f"        {o.case.basis}")
    print()

    # --- which rules did the work ----------------------------------------
    fired: Counter[str] = Counter()
    for o in outcomes:
        for rule_id in o.rules_fired:
            fired[rule_id] += 1
    print("-" * 72)
    print(" RULES THAT FIRED")
    print("-" * 72)
    if not fired:
        print("    none")
    for rule_id, count in fired.most_common():
        print(f"    {count:>4}  {rule_id}")
    print()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--label", help="tag this run in the report header")
    parser.add_argument(
        "--json", action="store_true", help="emit machine-readable summary only"
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help=(
            "exit non-zero if any case outside the documented-gap list is "
            "under-triaged. Suitable for CI."
        ),
    )
    args = parser.parse_args()

    outcomes = run(CASES)
    scored = [o for o in outcomes if not o.is_gap]

    if args.json:
        payload = {
            "label": args.label,
            "all": summarise(scored),
            "natural": summarise([o for o in scored if o.case.natural]),
            "under_triaged": [
                {
                    "description": o.case.description,
                    "gold": o.gold,
                    "returned": o.predicted,
                    "basis": o.case.basis,
                }
                for o in scored
                if o.delta < 0
            ],
            "documented_gaps": [
                {
                    "description": o.case.description,
                    "gold": o.gold,
                    "returned": o.predicted,
                    "closed": o.gap_closed,
                }
                for o in outcomes
                if o.is_gap
            ],
        }
        print(json.dumps(payload, indent=2))
    else:
        print_report(outcomes, args.label)

    if args.strict:
        under = [o for o in scored if o.delta < 0]
        if under:
            print(
                f"STRICT: {len(under)} case(s) under-triaged outside the "
                "documented-gap list.",
                file=sys.stderr,
            )
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
