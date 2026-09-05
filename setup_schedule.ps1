# setup_schedule.ps1 — register the MedHelp agent cycle with Windows Task Scheduler.
#
# Run once, from PowerShell, as yourself (no admin needed):
#
#     powershell -ExecutionPolicy Bypass -File .\setup_schedule.ps1
#
# It registers "MedHelp agent cycle" to run run_cycle_cron.sh every 30 minutes.
# The task runs as you, so it inherits your git credentials and claude auth —
# which is why it only fires while you are logged on.

$ErrorActionPreference = "Stop"

$name = "MedHelp agent cycle"
$repo = "C:\Users\a1str\OneDrive\Desktop\Game"
$bash = "C:\Program Files\Git\bin\bash.exe"

if (-not (Test-Path $bash)) { throw "Git Bash not found at $bash" }
if (-not (Test-Path (Join-Path $repo "run_cycle_cron.sh"))) { throw "run_cycle_cron.sh not found in $repo" }

# Replace any previous registration rather than stacking a second one.
$existing = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $name -Confirm:$false
    Write-Host "removed the previous '$name' task"
}

$action = New-ScheduledTaskAction `
    -Execute $bash `
    -Argument '-lc "/c/Users/a1str/OneDrive/Desktop/Game/run_cycle_cron.sh"' `
    -WorkingDirectory $repo

# First run three minutes from now, then every 30 minutes.
# Note: do NOT pass -RepetitionDuration ([TimeSpan]::MaxValue) — Task Scheduler
# rejects the resulting P99999999DT23H59M59S as out of range. Omitting the
# duration is what gives an indefinite repetition.
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(3) `
    -RepetitionInterval (New-TimeSpan -Minutes 30)

# IgnoreNew: if a cycle overruns its 30 minutes, skip the next one rather than
# running two agent cycles against one working tree.
# ExecutionTimeLimit: kill a hung cycle before the following one is due.
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 25)

Register-ScheduledTask -TaskName $name `
    -Action $action -Trigger $trigger -Settings $settings `
    -Description "Runs one MedHelp agent cycle (researcher -> debugger -> overseer) on a branch. Never merges to main. Log: .agent-cycles\cron.log" `
    -User $env:USERNAME | Out-Null

Write-Host ""
Write-Host "Registered '$name'." -ForegroundColor Green
Write-Host "  first run:  $((Get-Date).AddMinutes(3).ToString('HH:mm:ss')), then every 30 minutes"
Write-Host "  log:        $repo\.agent-cycles\cron.log"
Write-Host ""
Write-Host "Manage it with:"
Write-Host "  Get-ScheduledTask -TaskName '$name' | Get-ScheduledTaskInfo"
Write-Host "  Start-ScheduledTask      -TaskName '$name'      # run one now"
Write-Host "  Disable-ScheduledTask    -TaskName '$name'      # pause"
Write-Host "  Enable-ScheduledTask     -TaskName '$name'      # resume"
Write-Host "  Unregister-ScheduledTask -TaskName '$name' -Confirm:`$false"
