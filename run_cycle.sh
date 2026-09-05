#!/usr/bin/env bash
#
# run_cycle.sh — one full MedHelp agent cycle.
#
#   branch  ->  researcher  ->  debugger  ->  overseer  ->  push
#
# It never merges to main, never deploys, and aborts if main moves.
#
# Run it by hand first:
#
#     ./run_cycle.sh
#
# Wire it into cron yourself once you are happy with it, e.g. every 30 min:
#
#     */30 * * * * cd /path/to/Game && ./run_cycle.sh >> .agent-cycles/cron.log 2>&1
#
# Knobs (all optional, all environment variables):
#
#   BASE_BRANCH          branch to cut the cycle branch from   (default: main)
#   PUSH                 1 to push the branch, 0 to skip       (default: 1)
#   ALLOW_DIRTY          1 to run with a dirty working tree    (default: 0)
#   PHASE_TIMEOUT        seconds one agent phase may take      (default: 1200)
#   CLAUDE_BIN           path to claude.exe (default: resolved from the shim;
#                        must NOT be the npm sh shim — see the note in preflight)
#   CYCLE_CLAUDE_FLAGS   flags passed to every "claude -p" call
#                        (default: --permission-mode acceptEdits
#                                  --allowedTools Read Write Edit Grep Glob WebSearch Bash)
#
# Note on CYCLE_CLAUDE_FLAGS: headless "claude -p" cannot prompt, so any tool
# that is not pre-allowed is silently denied — the debugger would be unable to
# run pytest and would report a clean cycle it never actually ran. The default
# therefore allows Bash. If a run still stalls on permissions, the blunt
# instrument is:
#
#     CYCLE_CLAUDE_FLAGS="--dangerously-skip-permissions" ./run_cycle.sh
#
# What keeps this safe is the agent definitions in .claude/agents/ and the
# fences in CLAUDE.md, not the permission flag.

set -euo pipefail

# ---------------------------------------------------------------- config ----

BASE_BRANCH="${BASE_BRANCH:-main}"
PUSH="${PUSH:-1}"
ALLOW_DIRTY="${ALLOW_DIRTY:-0}"
PHASE_TIMEOUT="${PHASE_TIMEOUT:-1200}"

if [ -n "${CYCLE_CLAUDE_FLAGS:-}" ]; then
  # shellcheck disable=SC2206
  CLAUDE_FLAGS=( ${CYCLE_CLAUDE_FLAGS} )
else
  CLAUDE_FLAGS=( --permission-mode acceptEdits
                 --allowedTools Read Write Edit Grep Glob WebSearch Bash )
fi

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BRANCH="agent-cycle-${TIMESTAMP}"
SUMMARY="CYCLE_SUMMARY-${TIMESTAMP}.md"
LOGDIR=".agent-cycles/${TIMESTAMP}"

say()  { printf '\n\033[1m== %s\033[0m\n' "$*"; }
info() { printf '   %s\n' "$*"; }
die()  { printf '\n\033[1;31mABORT: %s\033[0m\n' "$*" >&2; exit 1; }

# ------------------------------------------------------------- preflight ----

say "Preflight"

command -v claude >/dev/null 2>&1 || die "the claude CLI is not on PATH"
command -v git    >/dev/null 2>&1 || die "git is not on PATH"

# ⛔ Invoke claude.exe directly. Do NOT "simplify" this back to `claude`.
#
# The npm entry on PATH (…/npm/claude) is a /bin/sh shim that hands off to
# claude.exe. Launched from an interactive shell that works fine. Launched from
# Task Scheduler the handoff never completes: the process sits at essentially
# zero CPU forever, producing no output and no error. Even `claude --version`
# hangs, which is what rules out auth, the network, stdin and the prompt.
#
# Measured 2026-09-04 under a scheduled task:
#   via the shim   `claude --version`  killed at 60s, no output
#   direct         `claude.exe --version`  exit 0 in 43s, "2.1.252 (Claude Code)"
#
# Resolved the same way the shim resolves it, so this follows an npm upgrade.
CLAUDE_BIN="${CLAUDE_BIN:-}"
if [ -z "$CLAUDE_BIN" ]; then
  _shim="$(command -v claude)"
  _exe="$(dirname "$_shim")/node_modules/@anthropic-ai/claude-code/bin/claude.exe"
  if [ -x "$_exe" ]; then CLAUDE_BIN="$_exe"; else CLAUDE_BIN="$_shim"; fi
fi
info "claude:     ${CLAUDE_BIN}"

# Prove it actually answers before committing to a cycle. Without this the
# failure surfaces as a wedged phase twenty minutes in, with an empty
# transcript and nothing in the log worth reading. Slow here (~43s observed),
# so the cap is generous.
if ! timeout --kill-after=10 120 "$CLAUDE_BIN" --version >/dev/null 2>&1; then
  die "${CLAUDE_BIN} did not answer --version within 120s.
       It cannot run agents in this environment, so the cycle would hang.
       If this is a scheduled task, check CLAUDE_BIN points at claude.exe
       itself and not at the npm sh shim."
fi

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || die "not inside a git repository"
cd "$REPO_ROOT"
info "repo:       $REPO_ROOT"

[ -f CLAUDE.md ] || die "CLAUDE.md not found at the repo root — wrong directory?"
for a in researcher debugger overseer; do
  [ -f ".claude/agents/${a}.md" ] || die "missing subagent definition .claude/agents/${a}.md"
done
info "agents:     researcher, debugger, overseer"

STARTED_ON="$(git rev-parse --abbrev-ref HEAD)"
info "started on: ${STARTED_ON}"

if [ -n "$(git status --porcelain)" ]; then
  if [ "$ALLOW_DIRTY" = "1" ]; then
    info "working tree is dirty; ALLOW_DIRTY=1, continuing"
    info "these uncommitted changes will be carried onto ${BRANCH}:"
    git status --porcelain | sed 's/^/     /'
  else
    printf '\n'
    git status --porcelain | sed 's/^/     /'
    die "working tree is not clean. Commit, stash, or re-run with ALLOW_DIRTY=1.
       (backend/*.err are tracked runtime logs and will always show up here —
        consider adding *.err to .gitignore and untracking them.)"
  fi
fi

git rev-parse --verify "$BASE_BRANCH" >/dev/null 2>&1 \
  || die "base branch ${BASE_BRANCH} does not exist. Set BASE_BRANCH=<name>."

# Remember where main is. Nothing in this cycle may move it.
MAIN_SHA_BEFORE="$(git rev-parse main 2>/dev/null || echo 'no-main')"

mkdir -p "$LOGDIR"

# ---------------------------------------------------------------- branch ----

say "1. Branch"

git checkout -q -b "$BRANCH" "$BASE_BRANCH" \
  || die "could not create branch ${BRANCH} from ${BASE_BRANCH}"
info "on ${BRANCH} (cut from ${BASE_BRANCH} @ $(git rev-parse --short "$BASE_BRANCH"))"

BASE_SHA="$(git rev-parse HEAD)"

# Assert we are still where we think we are. Called after every phase, because
# a phase that wandered onto another branch would silently review the wrong
# diff — and a phase that wandered onto main is the thing this script exists
# to prevent.
assert_on_branch() {
  local now main_now
  now="$(git rev-parse --abbrev-ref HEAD)"
  [ "$now" = "$BRANCH" ] || die "phase ${1} left us on branch ${now}, expected ${BRANCH}"
  main_now="$(git rev-parse main 2>/dev/null || echo 'no-main')"
  [ "$main_now" = "$MAIN_SHA_BEFORE" ] || die "phase ${1} moved main (${MAIN_SHA_BEFORE} -> ${main_now})"
}

# Run one phase. $1 = name, $2 = prompt.
run_phase() {
  local name="$1" prompt="$2" log rc
  log="${LOGDIR}/${name}.transcript.txt"

  info "running ${name}... (transcript: ${log})"

  # </dev/null is hygiene, not the fix. An earlier version of this comment
  # claimed it cured a hang under Task Scheduler; it did not — a controlled
  # probe showed the hang identical with and without it. The actual cause was
  # the npm sh shim, handled by CLAUDE_BIN above. Closing stdin is still right
  # for an unattended run, it just is not what makes this work.
  #
  # The timeout is what keeps a wedged phase legible. Without it a phase sits
  # until Task Scheduler's own kill limit, which takes the whole cycle down
  # mid-phase and writes nothing to the log worth reading.
  set +e
  timeout --signal=TERM --kill-after=30 "$PHASE_TIMEOUT" \
    "$CLAUDE_BIN" -p "$prompt" "${CLAUDE_FLAGS[@]}" </dev/null 2>&1 | tee "$log"
  rc=${PIPESTATUS[0]}
  set -e

  if [ "$rc" -eq 124 ] || [ "$rc" -eq 137 ]; then
    die "the ${name} phase produced nothing for ${PHASE_TIMEOUT}s and was killed — see ${log}"
  fi
  [ "$rc" -eq 0 ] || die "the ${name} phase exited ${rc} — see ${log}"

  assert_on_branch "$name"
}

# Commit whatever a phase left behind, so the next phase reviews a real diff.
commit_leftovers() {
  local who="$1"
  if [ -n "$(git status --porcelain)" ]; then
    git add -A
    git commit -q -F - <<COMMITMSG
${who}: uncommitted work from cycle ${TIMESTAMP}

Committed by run_cycle.sh because ${who} left changes in the working tree.
Not reviewed as a discrete change by the agent that made it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
COMMITMSG
    info "committed leftover changes from ${who}"
  fi
}

# ------------------------------------------------------------ researcher ----

say "2. Researcher"

read -r -d '' RESEARCHER_PROMPT <<PROMPT || true
Use the Agent tool with subagent_type "researcher" to run one research pass for this improvement cycle.

Ask it for ONE OR TWO proposals — no more. Each must follow the output format in .claude/agents/researcher.md, including the regulatory/privacy flag that is required on every proposal.

The researcher writes no code. If it returns anything resembling a diff, discard it and note that in the file below.

When it reports back, write its FULL report verbatim to ${LOGDIR}/researcher-proposals.md, under a heading naming the cycle timestamp ${TIMESTAMP}. Do not summarise it, do not act on it, and do not implement anything it proposes. This cycle only records proposals; a human decides what gets built.
PROMPT

run_phase researcher "$RESEARCHER_PROMPT"
commit_leftovers researcher

# -------------------------------------------------------------- debugger ----

say "3. Debugger"

read -r -d '' DEBUGGER_PROMPT <<PROMPT || true
Use the Agent tool with subagent_type "debugger" to find and fix real bugs in this repository.

We are on branch ${BRANCH}. It must not switch branches, must not touch main, and must not push or merge.

Remind it of its hard limits, which are also in .claude/agents/debugger.md:
- Fix actual failures only — failing tests, crashes, wrong values, broken builds, type errors. NOT style, formatting, renames, or reordered imports.
- Every fix needs a test that fails before the fix and passes after it.
- It must NOT modify backend/app/core/triage.py, backend/app/core/rules_triage.py, backend/app/core/emergency.py, INTAKE_DISCLAIMER or ESCALATION_GUIDANCE in backend/app/api/intake.py, or mobile/src/components/DisclaimerBanner.tsx. Bugs found in those areas are REPORTED, NOT FIXED.
- It should commit each fix separately on this branch, with a message saying what was wrong.
- If it finds no real bugs, that is a good outcome. It must say so rather than inventing work.

Test commands: from backend/ run "python -m pytest -q"; from mobile/ run "npx tsc --noEmit" and "npx jest". Do not run the e2e browser suites — they need a real browser.

When it reports back, write its FULL report verbatim to ${LOGDIR}/debugger-report.md, under a heading naming the cycle timestamp ${TIMESTAMP}.
PROMPT

run_phase debugger "$DEBUGGER_PROMPT"
commit_leftovers debugger

# -------------------------------------------------------------- overseer ----

say "4. Overseer"

read -r -d '' OVERSEER_PROMPT <<PROMPT || true
Use the Agent tool with subagent_type "overseer" to review everything from this cycle. This is the final gate.

Cycle timestamp: ${TIMESTAMP}
Branch: ${BRANCH}
Base commit: ${BASE_SHA} (cut from ${BASE_BRANCH})
Commit range to review: ${BASE_SHA}..HEAD

Inputs for it to read:
- ${LOGDIR}/researcher-proposals.md — what the researcher proposed
- ${LOGDIR}/debugger-report.md — what the debugger says it did
- "git diff ${BASE_SHA}..HEAD" and "git log ${BASE_SHA}..HEAD" — what actually changed

It must rule on EACH item separately (APPROVED / APPROVED WITH NOTES / REJECTED), verify the forbidden-list check against the diff itself rather than trusting the debugger's report, and judge whether each change is proportionate to the bug it claims to fix.

It may roll back rejected work on this branch with git revert or git restore, and must record the exact command it used.

It must then write ${SUMMARY} at the repo root, using the structure in .claude/agents/overseer.md, ending with a "Needs your attention" section. That section must state that this branch is NOT merged and must not be merged by any agent.

It must not push, merge, rebase, or touch main.
PROMPT

run_phase overseer "$OVERSEER_PROMPT"
assert_on_branch overseer

[ -f "$SUMMARY" ] || info "WARNING: ${SUMMARY} was not written — check ${LOGDIR}/overseer.transcript.txt"

# The overseer's own output is the summary and the transcripts, so this is its
# commit rather than a generic leftover one. Anything else it left is swept in
# here too — a rollback it did with git restore rather than git revert, say.
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -q -F - <<COMMITMSG
cycle ${TIMESTAMP}: overseer review, summary and transcripts

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
COMMITMSG
  info "committed ${SUMMARY} and transcripts"
fi

# ------------------------------------------------------------------ push ----

say "5. Push"

CURRENT="$(git rev-parse --abbrev-ref HEAD)"
[ "$CURRENT" = "$BRANCH" ] || die "expected to be on ${BRANCH}, am on ${CURRENT} — refusing to push"
[ "$CURRENT" != "main" ]   || die "refusing to push main"

if [ "$PUSH" = "1" ]; then
  if git remote get-url origin >/dev/null 2>&1; then
    if git push -q -u origin "$BRANCH"; then
      info "pushed ${BRANCH} to origin"
    else
      info "WARNING: push failed (credentials? network?). The branch is intact locally."
      info "         push it yourself with: git push -u origin ${BRANCH}"
    fi
  else
    info "no origin remote configured; skipping push"
  fi
else
  info "PUSH=0; skipping push"
fi

# ---------------------------------------------------------------- report ----

MAIN_SHA_AFTER="$(git rev-parse main 2>/dev/null || echo 'no-main')"
[ "$MAIN_SHA_AFTER" = "$MAIN_SHA_BEFORE" ] \
  || die "main moved during this cycle — investigate before doing anything else"

say "Cycle ${TIMESTAMP} complete"
info "branch:      ${BRANCH}  (NOT merged — merging is a human decision)"
info "summary:     ${SUMMARY}"
info "transcripts: ${LOGDIR}/"
info "commits:"
git --no-pager log --oneline "${BASE_SHA}..HEAD" | sed 's/^/     /' || true
printf '\n'
info "main is untouched at ${MAIN_SHA_BEFORE}"
info "review ${SUMMARY}, then merge by hand if you want this."
printf '\n'
