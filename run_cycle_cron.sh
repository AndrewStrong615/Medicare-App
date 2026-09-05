#!/usr/bin/env bash
#
# run_cycle_cron.sh — the thing Windows Task Scheduler actually invokes.
#
# run_cycle.sh is the cycle. This wrapper only supplies the environment a
# scheduled task does not inherit, and appends everything to one log:
#
#     .agent-cycles/cron.log
#
# Registered as scheduled task "MedHelp agent cycle", every 30 minutes.
# To change the cadence or stop it, see the bottom of this file.

# --- environment a scheduled task does not inherit ---------------------------

# claude is an npm global; a non-interactive scheduled shell does not have the
# npm prefix on PATH, and the failure mode is "the claude CLI is not on PATH"
# once every 30 minutes.
NPM_GLOBAL="/c/Users/a1str/AppData/Roaming/npm"
[ -d "$NPM_GLOBAL" ] && export PATH="${NPM_GLOBAL}:${PATH}"

# --- which branch cycles are cut from ----------------------------------------
#
# NOT main. main does not carry .claude/agents/{researcher,debugger,overseer}.md
# yet, so a cycle cut from main aborts in preflight. Merging these to main is a
# human decision that CLAUDE.md fences, so this points at the branch that has
# them. Change it here once they land on main.
export BASE_BRANCH="${BASE_BRANCH:-feature-emergency-card-refills-home}"

# --- run ---------------------------------------------------------------------

cd "$(dirname "$0")" || exit 1
mkdir -p .agent-cycles
LOG=".agent-cycles/cron.log"

{
  echo ""
  echo "======================================================================"
  echo "  cycle start: $(date '+%Y-%m-%d %H:%M:%S')   base: ${BASE_BRANCH}"
  echo "======================================================================"
} >> "$LOG"

./run_cycle.sh >> "$LOG" 2>&1
status=$?

echo "  cycle end:   $(date '+%Y-%m-%d %H:%M:%S')   exit=${status}" >> "$LOG"
exit "$status"

# --- managing the schedule (PowerShell) --------------------------------------
#
#   Get-ScheduledTask -TaskName "MedHelp agent cycle" | Get-ScheduledTaskInfo
#   Disable-ScheduledTask   -TaskName "MedHelp agent cycle"     # pause
#   Enable-ScheduledTask    -TaskName "MedHelp agent cycle"     # resume
#   Unregister-ScheduledTask -TaskName "MedHelp agent cycle" -Confirm:$false
#   Start-ScheduledTask     -TaskName "MedHelp agent cycle"     # run one now
