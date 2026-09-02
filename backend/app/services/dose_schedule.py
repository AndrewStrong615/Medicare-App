"""
Suggesting reminder times from a medication's frequency text.

READ THIS BEFORE CHANGING ANYTHING HERE.

## What this is, and what it is not

This module proposes *alarm times for a reminder*. It does not interpret a
prescription, and nothing it returns is dosing advice.

CLAUDE.md is explicit that the directions line is carried verbatim and that
expanding an abbreviation into dosing instructions would be app-authored
clinical content, because a wrong expansion changes when someone takes a
medicine. That rule is why this module is shaped the way it is:

* **It never edits, rewrites, or replaces the frequency text.** The sig line
  is displayed verbatim beside whatever this proposes, so the user is always
  comparing a suggestion against the real thing.
* **Nothing it returns takes effect on its own.** The API returns these as a
  suggestion, the user reviews the times on screen, and no reminder exists
  until they save. Same read-then-confirm shape as the label scanner: the app
  proposes, a person decides.
* **It declines far more readily than it guesses.** Anything not on the
  explicit lists below returns no suggestion at all, with a reason the UI can
  show, and the user adds times themselves. Not recognising a frequency is a
  safe outcome; inventing a schedule for it is not.

## The times themselves are conveniences, not clinical choices

"Twice daily" does not mean 08:00 and 20:00 — it means twice a day, and which
hours suit depends on the person, the drug, and instructions this app never
sees. The clock times below are neutral waking-hours defaults chosen only so
the user has something to adjust rather than an empty form. Every one of them
is editable before anything is saved.

## Deliberately not recognised

* **"As needed" / PRN.** An as-needed medicine has no schedule, and an alarm
  telling someone to take one is actively wrong. Recognised only in order to
  refuse it, with a reason.
* **Anything that is not a simple daily rhythm** — weekly, every other day,
  cycled courses. The reminder model here is daily times; a frequency that
  does not fit that shape gets no suggestion rather than a wrong one.
* **Food, timing and route qualifiers** ("with meals", "on an empty stomach",
  "before bed") are not acted on beyond the bedtime case below. They stay in
  the verbatim text where the user can read them.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# Neutral waking-hours defaults, spread evenly enough to be a sensible
# starting point. Not clinical guidance - see the module note.
DEFAULT_TIMES: dict[int, list[str]] = {
    1: ["09:00"],
    2: ["08:00", "20:00"],
    3: ["08:00", "14:00", "20:00"],
    4: ["08:00", "13:00", "18:00", "22:00"],
    5: ["07:00", "11:00", "15:00", "19:00", "23:00"],
    6: ["06:00", "10:00", "14:00", "18:00", "22:00", "02:00"],
}

# More than this many reminders a day stops being a reminder and starts being
# a nuisance, and no ordinary oral medication needs it. Above the cap we
# decline rather than fill someone's day with alarms.
MAX_DOSES_PER_DAY = 6

# Recognised only so it can be refused. An as-needed medicine has no schedule.
AS_NEEDED = re.compile(
    r"\b(as needed|as required|when needed|if needed|prn|p\.r\.n\.|as directed)\b",
    re.IGNORECASE,
)

# Rhythms this reminder model cannot express. Declined with a reason.
NOT_DAILY = re.compile(
    r"\b(every other day|alternate days|weekly|every week|once a week|"
    r"monthly|every month|every \d+ days?|every \d+ weeks?|"
    r"on (mon|tue|wed|thu|fri|sat|sun))",
    re.IGNORECASE,
)

# "every 8 hours", "q6h", "q 12 hours"
EVERY_N_HOURS = re.compile(
    r"\b(?:every|q)\s*(\d{1,2})\s*(?:h|hr|hrs|hour|hours)\b", re.IGNORECASE
)

# Bedtime dosing, which has an obvious default hour that a morning default
# would get plainly wrong.
AT_BEDTIME = re.compile(r"\b(at bedtime|before bed|nightly|at night|qhs|q\.h\.s\.)\b", re.IGNORECASE)
BEDTIME_HOUR = "22:00"

# Lay phrasing and the printed abbreviations, in the order a label uses them.
# People write "twice a day"; pharmacies print "BID". Both appear.
DOSES_PER_DAY: list[tuple[re.Pattern[str], int]] = [
    (re.compile(r"\b(four times|4 times|4x|qid|q\.i\.d\.)\b", re.IGNORECASE), 4),
    (re.compile(r"\b(three times|3 times|3x|tid|t\.i\.d\.)\b", re.IGNORECASE), 3),
    (re.compile(r"\b(twice|two times|2 times|2x|bid|b\.i\.d\.)\b", re.IGNORECASE), 2),
    (
        re.compile(
            r"\b(once daily|once a day|one time|1x|daily|every day|each day|"
            r"qd|q\.d\.|od)\b",
            re.IGNORECASE,
        ),
        1,
    ),
]


@dataclass(frozen=True)
class DoseSuggestion:
    """
    What the app is willing to propose for one frequency line.

    `recognised` false means exactly that - no schedule is being proposed and
    the user should set their own times. It is never an error, and the UI must
    not present it as one.
    """

    recognised: bool
    times: list[str] = field(default_factory=list)
    doses_per_day: int | None = None
    # Plain-language explanation shown when nothing is proposed.
    reason: str | None = None


def _spread_every_n_hours(hours: int) -> list[str]:
    """
    Times for an "every N hours" instruction, starting at 08:00.

    Round-the-clock dosing genuinely means round the clock, so these are not
    confined to waking hours - an "every 6 hours" course really does have a
    02:00 dose, and hiding it would misrepresent the instruction. The user can
    move or delete any of them.
    """
    count = 24 // hours
    return [f"{(8 + hours * index) % 24:02d}:00" for index in range(count)]


def suggest_times(frequency: str | None) -> DoseSuggestion:
    """
    Propose reminder times for a frequency line, or decline to.

    Never raises, never returns a partial guess. The caller must treat the
    result as a draft for the user to confirm.
    """
    if not frequency or not frequency.strip():
        return DoseSuggestion(
            recognised=False,
            reason="This medication has no directions saved, so MedHelp has no times to suggest.",
        )

    text = frequency.strip()

    # Order matters. "As needed" is checked first because a label often reads
    # "take 1 tablet every 6 hours as needed for pain" - the interval is
    # present, but it is a maximum, not a schedule, and scheduling an alarm
    # from it would tell someone to take a medicine they may not need.
    if AS_NEEDED.search(text):
        return DoseSuggestion(
            recognised=False,
            reason=(
                "These directions say to take it as needed, so there is no fixed "
                "schedule to remind you about. You can still add your own times."
            ),
        )

    if NOT_DAILY.search(text):
        return DoseSuggestion(
            recognised=False,
            reason=(
                "MedHelp can only set reminders that repeat every day, and these "
                "directions do not. You can add your own times."
            ),
        )

    every = EVERY_N_HOURS.search(text)
    if every:
        hours = int(every.group(1))
        if hours < 1 or 24 % hours != 0 or 24 // hours > MAX_DOSES_PER_DAY:
            return DoseSuggestion(
                recognised=False,
                reason=(
                    "MedHelp couldn't turn these directions into a daily set of "
                    "times. You can add your own."
                ),
            )
        times = _spread_every_n_hours(hours)
        return DoseSuggestion(recognised=True, times=times, doses_per_day=len(times))

    for pattern, count in DOSES_PER_DAY:
        if pattern.search(text):
            # "once daily at bedtime" is a single dose with an obvious hour; a
            # 09:00 default would be plainly wrong there.
            if count == 1 and AT_BEDTIME.search(text):
                return DoseSuggestion(
                    recognised=True, times=[BEDTIME_HOUR], doses_per_day=1
                )
            return DoseSuggestion(
                recognised=True, times=list(DEFAULT_TIMES[count]), doses_per_day=count
            )

    # Bedtime on its own ("take one at bedtime") implies a single daily dose.
    if AT_BEDTIME.search(text):
        return DoseSuggestion(recognised=True, times=[BEDTIME_HOUR], doses_per_day=1)

    return DoseSuggestion(
        recognised=False,
        reason=(
            "MedHelp couldn't read a daily schedule from these directions. Add the "
            "times you take it and it will remind you then."
        ),
    )
