"""
Diagnostic helper: group failures by the *complaint* that produced them.

A failure count by presentation says which illness is wrong. This says which
lay phrasing is wrong, which is the thing a fix actually has to move. Run it
after `measure_common_illness.py` reports a cluster.

    python scripts/triage_eval/diagnose.py
    python scripts/triage_eval/diagnose.py --under
    python scripts/triage_eval/diagnose.py --presentation heart_failure
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent))
sys.path.insert(0, str(HERE))

from app.core import emergency, rules_triage  # noqa: E402

from common_illness import CASES, TIER_RANK, build_all  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--under", action="store_true")
    ap.add_argument("--over", action="store_true")
    ap.add_argument("--presentation")
    ap.add_argument("--limit", type=int, default=200)
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()

    cases = build_all() if args.all else CASES

    # complaint-shaped key -> (gold, predicted, count, example)
    groups: dict[tuple[str, str, str, str], list[str]] = defaultdict(list)

    for case in cases:
        if args.presentation and case.presentation != args.presentation:
            continue
        result = rules_triage.classify(case.description)
        delta = TIER_RANK[result.tier_name] - TIER_RANK[case.gold]
        if delta == 0:
            continue
        if args.under and delta > 0:
            continue
        if args.over and delta < 0:
            continue
        key = (case.presentation, case.label, case.gold, result.tier_name)
        groups[key].append(case.description)

    rows = sorted(groups.items(), key=lambda kv: -len(kv[1]))
    for (pres, label, gold, got), descs in rows[: args.limit]:
        direction = "UNDER" if TIER_RANK[got] < TIER_RANK[gold] else "OVER "
        print(f"\n[{direction}] {label}  ({pres})  gold {gold} -> got {got}   n={len(descs)}")
        # The shortest example is usually the bare complaint, which is the
        # phrasing a fix has to match.
        for d in sorted(set(descs), key=len)[:4]:
            fired = rules_triage.classify(d)
            terms = [t for m in fired.matches for t in m.matched_terms]
            print(f"        {d!r}")
            print(f"            fired={[m.rule_id for m in fired.matches]} terms={terms}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
