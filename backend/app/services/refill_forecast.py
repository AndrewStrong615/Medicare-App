"""
Estimating when a medication will run out.

READ THIS BEFORE CHANGING ANYTHING HERE.

## What this is, and what it is not

This projects a **date from arithmetic the user supplied**. It is not a
measurement, it is not adherence tracking, and it is not clinical advice about
when to reorder anything.

Two rules from elsewhere in this repository decide the whole shape of it:

* **The directions line is carried verbatim and never decoded.** CLAUDE.md is
  explicit that expanding "BID" or "TWICE DAILY" into a number of doses is
  app-authored clinical content, because a wrong expansion changes when
  someone takes a medicine. So this module **never reads `frequency`**. It
  takes a doses-per-day number that a person has confirmed — either typed on
  the medication form, or implied by the reminder times they saved — and
  nothing else. `dose_schedule.suggest_times` exists to *propose* a schedule a
  user then confirms; it is deliberately not called from here.

* **MedHelp is not an adherence record.** Nothing anywhere logs whether a dose
  was taken, and `reminderTiming.dueState` is careful to say "earlier today"
  rather than "missed" for exactly that reason. This module therefore assumes
  every dose is taken exactly on schedule, which is an assumption that is
  routinely wrong in both directions. That is why every answer it produces is
  labelled an estimate wherever it is shown, and why `is_estimate` is not
  optional.

## Declining is a normal outcome

Missing quantity, no confirmed doses-per-day, a count from the future: each
returns no estimate and a reason meant for the user, never a guess. A wrong
run-out date is worse than none — someone deciding whether to chase a
prescription is better served by "we can't work this out" than by a
confident date built on a number nobody gave us.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

# Days before the estimated run-out that an alert fires. Three is a working
# default rather than a clinical one: long enough to contact a prescriber or
# pharmacy, short enough that the estimate has not drifted far. The user can
# change it — see `REFILL_LEAD_DAYS_MIN` / `MAX`.
REFILL_LEAD_DAYS_DEFAULT = 3
REFILL_LEAD_DAYS_MIN = 1
REFILL_LEAD_DAYS_MAX = 30

# Above this the projection stops meaning anything: a count entered two years
# ago against a supply nobody has revisited is not information. Declining is
# the honest answer.
MAX_PROJECTION_DAYS = 400

# Where the doses-per-day figure came from. Surfaced to the user so they can
# see what the estimate rests on and correct it, rather than being handed a
# date with no provenance.
DoseSource = str  # "entered" | "reminders"


@dataclass(frozen=True)
class RefillForecast:
    """
    What MedHelp is willing to say about running out.

    `run_out_on is None` means exactly that — no estimate is being offered and
    the UI must not fill the gap. It is never an error.
    """

    run_out_on: date | None = None
    days_remaining: int | None = None
    # True when `days_remaining` is inside the lead time, including when it has
    # already gone negative.
    alert: bool = False
    doses_per_day: int | None = None
    doses_per_day_source: DoseSource | None = None
    # Plain-language explanation shown when nothing is estimated.
    reason: str | None = None

    @property
    def is_estimate(self) -> bool:
        """
        Always true when there is an answer at all.

        A property rather than a field so it cannot be constructed False. The
        projection assumes perfect adherence, which MedHelp has no way to
        check and must not imply it can — see the module note.
        """
        return self.run_out_on is not None


def resolve_doses_per_day(
    entered: int | None, enabled_reminder_count: int
) -> tuple[int | None, DoseSource | None]:
    """
    How many doses a day, and on whose authority.

    Order matters and is not arbitrary. A number typed on the medication form
    is the user saying it directly, so it wins. Failing that, the count of
    reminder times they saved is the same statement made a different way —
    those times exist only because someone reviewed a draft and pressed save,
    so treating them as a confirmed doses-per-day figure adds no guess of our
    own.

    What is deliberately *not* consulted is the `frequency` text. Reading a
    number of doses out of "TAKE 1 TABLET BY MOUTH TWICE DAILY" is the decode
    the verbatim rule forbids.
    """
    if entered is not None and entered >= 1:
        return entered, "entered"
    if enabled_reminder_count >= 1:
        return enabled_reminder_count, "reminders"
    return None, None


def forecast(
    *,
    quantity_remaining: int | None,
    quantity_counted_on: date | None,
    doses_per_day: int | None,
    enabled_reminder_count: int = 0,
    today: date,
    lead_days: int = REFILL_LEAD_DAYS_DEFAULT,
) -> RefillForecast:
    """
    When this medication is estimated to run out, or why it cannot be said.

    Never raises and never returns a partial guess.
    """
    resolved, source = resolve_doses_per_day(doses_per_day, enabled_reminder_count)

    if quantity_remaining is None or quantity_counted_on is None:
        return RefillForecast(
            doses_per_day=resolved,
            doses_per_day_source=source,
            reason=(
                "Add how many you have left and MedHelp can estimate when you will "
                "run out."
            ),
        )

    if quantity_remaining < 0:
        # Not reachable through the API, which validates this. Belt and braces:
        # a negative supply must not become a run-out date in the past.
        return RefillForecast(
            doses_per_day=resolved,
            doses_per_day_source=source,
            reason="MedHelp couldn't work out how much you have left.",
        )

    if resolved is None:
        return RefillForecast(
            reason=(
                "Set how many times a day you take this, or add reminder times, and "
                "MedHelp can estimate when you will run out."
            )
        )

    if quantity_counted_on > today:
        # A count dated in the future would project a run-out further out than
        # the supply justifies, which errs in the unsafe direction.
        return RefillForecast(
            doses_per_day=resolved,
            doses_per_day_source=source,
            reason="The date you counted these is in the future, so MedHelp can't estimate from it.",
        )

    # Whole days only. Half a day's supply does not get someone through a day,
    # so the remainder is dropped rather than rounded up.
    days_of_supply = quantity_remaining // resolved

    if days_of_supply > MAX_PROJECTION_DAYS:
        return RefillForecast(
            doses_per_day=resolved,
            doses_per_day_source=source,
            reason="That is more than a year's supply, so MedHelp isn't estimating a date.",
        )

    run_out_on = quantity_counted_on + timedelta(days=days_of_supply)
    days_remaining = (run_out_on - today).days

    return RefillForecast(
        run_out_on=run_out_on,
        days_remaining=days_remaining,
        alert=days_remaining <= lead_days,
        doses_per_day=resolved,
        doses_per_day_source=source,
    )


def clamp_lead_days(value: int | None) -> int:
    """The lead time, kept inside a range an alert can usefully live in."""
    if value is None:
        return REFILL_LEAD_DAYS_DEFAULT
    return max(REFILL_LEAD_DAYS_MIN, min(REFILL_LEAD_DAYS_MAX, value))
