"""
Mutation pass over the health-goals safety properties.

    cd <repo root>
    python backend/scripts/goal_mutation_check.py

For each rule this feature claims to enforce, this breaks it in the source and
checks the suite notices. A mutation that SURVIVES is a rule nothing is
actually testing.

WHY THIS EXISTS. Four times in one sitting this feature had a test that was
green for a reason unrelated to what it claimed:

  - the goals screen's ticks asserted `accessibilityState`, which passes in
    jsdom whether or not anything reaches the DOM
  - the shape bands' attribution rule explained every rejection when the floor
    was set to something unsatisfiable
  - the prompt-ordering test matched a cross-reference rather than a heading
  - and the two complexity tests below, found by this script: both used a
    one-row plan, so replacing the discard with `complexity = "moderate"`
    still failed the moderate ROW COUNT. They demonstrated "one row is not
    three rows" while claiming to demonstrate "a missing reading is refused"

A passing suite is evidence about the tests, not about the code. This is the
cheapest way to tell the difference, and it needs no model and no key.

⛔ IT EDITS SOURCE FILES IN PLACE and restores them in a `finally`, so do not
run it over a dirty tree — check `git status` first, and check it again after.
⛔ A SURVIVOR IS NOT FIXED BY DELETING THE MUTATION. Fix the test.

Not part of `pytest`: it runs the suite once per mutation, which takes
minutes.
"""

import subprocess
import sys
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):  # pragma: no cover - not a tty
        pass

ROOT = Path(__file__).resolve().parent.parent  # backend/
CORE = ROOT / "app/core/goal_structuring.py"
EVID = ROOT / "app/core/goal_evidence.py"
API = ROOT / "app/api/goals.py"

# (label, file, find, replace) — each is a real weakening of a stated rule.
MUTATIONS = [
    (
        "the weekly-shape check is removed entirely",
        CORE,
        "    if days_touched < fewest_days:",
        "    if False:",
    ),
    (
        "the slot ceiling is removed",
        CORE,
        "    if slots > most_slots:",
        "    if False:",
    ),
    (
        "an unrecognised complexity defaults to moderate instead of discarding",
        CORE,
        'return _discard("plan: no recognised reading of the goal\'s complexity")',
        'complexity = "moderate"',
    ),
    (
        "the row count no longer has to match the declared complexity",
        CORE,
        "    if not fewest <= len(raw_activities) <= most:",
        "    if False:",
    ),
    (
        "a row may come back with no detail",
        CORE,
        'return _discard("plan: an activity had no detail")',
        'detail = "x"',
    ),
    (
        "a suggested row is no longer marked generated",
        CORE,
        "                generated=True,",
        "                generated=False,",
    ),
    (
        "a row with no usable day list is kept instead of discarding the plan",
        CORE,
        'return _discard("plan: an activity had no usable list of days")',
        "days = tuple(DAYS)",
    ),
    (
        "a clock time is guessed rather than refused",
        CORE,
        "    return value if _TIME_PATTERN.match(value) else None",
        '    return value if _TIME_PATTERN.match(value) else "08:00"',
    ),
    (
        "the published figure leaves the prompt",
        CORE,
        "- About 150 minutes of moderate, walking-pace activity across the week,",
        "- A sensible amount of walking-pace activity across the week,",
    ),
    (
        "an unknown evidence domain snaps to the nearest source",
        EVID,
        "    return BY_DOMAIN.get(domain.strip().lower())",
        "    return BY_DOMAIN.get(domain.strip().lower()) or _SOURCES[0]",
    ),
    (
        "a citation travels without its caveat",
        API,
        "        caveat=EVIDENCE_CAVEAT,",
        '        caveat="",',
    ),
    (
        "emergency screening no longer runs before the planner",
        API,
        "screen_for_emergency",
        "_screen_for_emergency_DISABLED",
    ),
]


def run_suite() -> bool:
    """True when the suite is green."""
    result = subprocess.run(
        [sys.executable, "-m", "pytest", "-q", "--no-header", "-x",
         "tests/test_goals.py", "tests/test_goal_evidence.py"],
        cwd=ROOT, capture_output=True, text=True,
    )
    return result.returncode == 0


def read(path: Path) -> str:
    """Exact bytes-as-text: `newline=""` stops Python translating line endings."""
    with path.open("r", encoding="utf-8", newline="") as handle:
        return handle.read()


def write(path: Path, text: str) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        handle.write(text)


# ⛔ Read and written with newline="" throughout. Python's text mode would
# otherwise translate a bare line feed into a carriage-return pair on Windows
# when restoring, quietly rewriting every line of three source files as the
# price of running a check.
originals = {path: read(path) for path in (CORE, EVID, API)}
survivors = []

try:
    print(f"{'mutation':<62}{'result':>10}")
    print("-" * 72)
    for label, path, find, replace in MUTATIONS:
        source = originals[path]
        if source.count(find) < 1:
            print(f"{label:<62}{'NO ANCHOR':>10}")
            survivors.append((label, "the anchor text is not in the file"))
            continue
        write(path, source.replace(find, replace))
        green = run_suite()
        write(path, source)
        print(f"{label:<62}{'SURVIVED' if green else 'caught':>10}")
        if green:
            survivors.append((label, "the suite stayed green"))
finally:
    for path, text in originals.items():
        write(path, text)

print()
if survivors:
    print("RULES NOTHING IS ACTUALLY TESTING:")
    for label, why in survivors:
        print(f"   - {label}  ({why})")
    sys.exit(1)
print("Every mutation was caught.")
