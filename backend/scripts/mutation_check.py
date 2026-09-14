"""
Mutation pass over the safety properties of health goals and symptom triage.

    cd <repo root>
    python backend/scripts/mutation_check.py            # everything
    python backend/scripts/mutation_check.py goals      # one group
    python backend/scripts/mutation_check.py triage

For each rule these features claim to enforce, this breaks it and checks the
suite notices. A mutation that SURVIVES is a rule nothing is actually testing.

WHY THIS EXISTS. Four times in one sitting the goals feature had a test that
was green for a reason unrelated to what it claimed:

  - the goals screen's ticks asserted `accessibilityState`, which passes in
    jsdom whether or not anything reaches the DOM
  - the shape bands' attribution rule explained every rejection once the floor
    was set to something unsatisfiable
  - the prompt-ordering test matched a cross-reference rather than a heading
  - and the two complexity tests, found by this script: both used a one-row
    plan, so replacing the discard with `complexity = "moderate"` still failed
    the moderate ROW COUNT. They demonstrated "one row is not three rows"
    while claiming to demonstrate "a missing reading is refused"

A passing suite is evidence about the tests, not about the code. This is the
cheapest way to tell them apart, and it needs no model and no key.

⛔ IT NEVER TOUCHES THE WORKING TREE. Every mutation is applied to a throwaway
COPY of `backend/`, and the suite runs there. An earlier version edited files
in place and restored them in a `finally`, which left a window where an
interrupted run would strand a mutated source file — observed once, on a real
run. That is merely untidy for `goal_structuring.py`. It is unacceptable for
`triage.py`, so the design changed rather than the reassurance.

⛔ THE TRIAGE GROUP READS FENCED MODULES AND CHANGES NONE OF THEM. CLAUDE.md
forbids modifying `triage.py`, `rules_triage.py` and `emergency.py`, and
permits adding tests for them. This adds no test to them and modifies nothing:
it copies them, breaks the copy, and deletes it. The committed files are never
opened for writing — check `git status` after a run and it will say so.

⛔ A SURVIVOR IS NOT FIXED BY DELETING THE MUTATION. Fix the test.

Not part of `pytest`: it runs the suite once per mutation, which takes minutes.
"""

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):  # pragma: no cover - not a tty
        pass

ROOT = Path(__file__).resolve().parent.parent  # backend/

# Paths RELATIVE to backend/, resolved inside the throwaway copy.
CORE = "app/core/goal_structuring.py"
EVID = "app/core/goal_evidence.py"
API = "app/api/goals.py"
TRIAGE = "app/core/triage.py"
RULES = "app/core/rules_triage.py"

# Copied per mutation. Nothing here is worth carrying into a scratch tree, and
# a stale __pycache__ would shadow the mutated source.
SKIP = shutil.ignore_patterns("__pycache__", "*.pyc", ".venv", "venv", "*.db",
                              "certs", ".pytest_cache")

# (group, label, file, find, replace) — each a real weakening of a stated rule.
MUTATIONS = [
    (
        "goals",
        "the weekly-shape check is removed entirely",
        CORE,
        "    if days_touched < fewest_days:",
        "    if False:",
    ),
    (
        "goals",
        "the slot ceiling is removed",
        CORE,
        "    if slots > most_slots:",
        "    if False:",
    ),
    (
        "goals",
        "an unrecognised complexity defaults to moderate instead of discarding",
        CORE,
        'return _discard("plan: no recognised reading of the goal\'s complexity")',
        'complexity = "moderate"',
    ),
    (
        "goals",
        "the row count no longer has to match the declared complexity",
        CORE,
        "    if not fewest <= len(raw_activities) <= most:",
        "    if False:",
    ),
    (
        "goals",
        "a row may come back with no detail",
        CORE,
        'return _discard("plan: an activity had no detail")',
        'detail = "x"',
    ),
    (
        "goals",
        "a suggested row is no longer marked generated",
        CORE,
        "                generated=True,",
        "                generated=False,",
    ),
    (
        "goals",
        "a row with no usable day list is kept instead of discarding the plan",
        CORE,
        'return _discard("plan: an activity had no usable list of days")',
        "days = tuple(DAYS)",
    ),
    (
        "goals",
        "a clock time is guessed rather than refused",
        CORE,
        "    return value if _TIME_PATTERN.match(value) else None",
        '    return value if _TIME_PATTERN.match(value) else "08:00"',
    ),
    (
        "goals",
        "the published figure leaves the prompt",
        CORE,
        "- About 150 minutes of moderate, walking-pace activity across the week,",
        "- A sensible amount of walking-pace activity across the week,",
    ),
    (
        "goals",
        "an unknown evidence domain snaps to the nearest source",
        EVID,
        "    return BY_DOMAIN.get(domain.strip().lower())",
        "    return BY_DOMAIN.get(domain.strip().lower()) or _SOURCES[0]",
    ),
    (
        "goals",
        "a citation travels without its caveat",
        API,
        "        caveat=EVIDENCE_CAVEAT,",
        '        caveat="",',
    ),
    (
        "goals",
        "emergency screening no longer runs before the planner",
        API,
        # Unique: the call site, not the import or the module docstring. The
        # bare name appears three times, and the count guard refused it —
        # which is the guard working. The in-place version before it replaced
        # all three without noticing.
        "    guidance = screen_for_emergency(payload.description)",
        "    guidance = None",
    ),
    # -----------------------------------------------------------------------
    # The five properties CLAUDE.md says hold for triage, "each asserted by
    # tests". This asks whether that is true of the tests as written.
    #
    # ⛔ Applied to a COPY. The fenced modules on disk are not written to.
    # -----------------------------------------------------------------------
    (
        "triage",
        "1. the rules default to SELF_CARE instead of URGENT",
        RULES,
        'tier_name="URGENT",\n        reasoning=DEFAULT_REASONING,',
        'tier_name="SELF_CARE",\n        reasoning=DEFAULT_REASONING,',
    ),
    (
        "triage",
        "3. the two layers reconcile with min() instead of max()",
        TRIAGE,
        "    return max(candidates)",
        "    return min(candidates)",
    ),
    (
        "triage",
        "3b. the model tier simply replaces the rule tier",
        TRIAGE,
        "    return max(candidates)",
        "    return candidates[-1]",
    ),
]


SUITES = {
    "goals": ("tests/test_goals.py", "tests/test_goal_evidence.py"),
    "triage": ("tests/test_triage.py", "tests/test_rules_triage.py",
               "tests/test_emergency.py", "tests/test_triage_eval.py"),
}


def read(path: Path) -> str:
    """Exact text: `newline=""` stops Python translating line endings."""
    with path.open("r", encoding="utf-8", newline="") as handle:
        return handle.read()


def write(path: Path, text: str) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        handle.write(text)


def survives(group: str, relative: str, find: str, replace: str) -> str | None:
    """
    Apply one mutation in a throwaway copy and run that group's suite there.

    Returns None when the suite caught it, or a reason when it did not — which
    includes the anchor text having moved, because a mutation that cannot be
    applied is not a mutation that was caught.
    """
    with tempfile.TemporaryDirectory(prefix="mutation-") as scratch:
        copy = Path(scratch) / "backend"
        shutil.copytree(ROOT, copy, ignore=SKIP)

        target = copy / relative
        # ⛔ Normalised to bare line feeds before matching. These files are
        # CRLF on disk, so a multi-line anchor written with a bare line feed
        # matches nothing — which is how the first triage run reported a
        # mutation it had never actually applied. The copy is deleted either
        # way, so rewriting its line endings costs nothing.
        source = read(target).replace(chr(13) + chr(10), chr(10))
        if source.count(find) != 1:
            # Not a survivor: a mutation that could not be applied proves
            # nothing about the tests, and saying so is the point.
            return f"the anchor text appears {source.count(find)} times, not once"
        write(target, source.replace(find, replace))

        result = subprocess.run(
            [sys.executable, "-m", "pytest", "-q", "--no-header", "-x",
             *SUITES[group]],
            cwd=copy, capture_output=True, text=True,
        )
        return "the suite stayed green" if result.returncode == 0 else None


wanted = sys.argv[1] if len(sys.argv) > 1 else None
if wanted and wanted not in SUITES:
    sys.exit(f"unknown group {wanted!r}; choose from {', '.join(SUITES)}")

survivors = []
print(f"{'mutation':<62}{'result':>10}")
print("-" * 72)
for group, label, relative, find, replace in MUTATIONS:
    if wanted and group != wanted:
        continue
    reason = survives(group, relative, find, replace)
    print(f"{label:<62}{'SURVIVED' if reason else 'caught':>10}")
    if reason:
        survivors.append((label, reason))

print()
if survivors:
    print("RULES NOTHING IS ACTUALLY TESTING:")
    for label, why in survivors:
        print(f"   - {label}  ({why})")
    sys.exit(1)
print("Every mutation was caught.")
