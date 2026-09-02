"""
Request and response shapes for medication reminders.

The suggestion and the saved schedule are separate types on purpose. A
suggestion is something MedHelp proposes and nobody has agreed to yet; a
schedule is what the user confirmed. Keeping them apart in the API makes it
hard to accidentally treat the first as the second.
"""

import re

from pydantic import BaseModel, Field, field_validator

# 24-hour wall clock. Anchored so "0800" or "8am" is rejected rather than
# quietly reinterpreted - a mis-parsed time is a medication taken at the wrong
# hour.
TIME_PATTERN = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")

# The same ceiling the suggestion service uses. Enforced here too, because the
# client can post times the service never proposed.
MAX_TIMES_PER_MEDICATION = 6


def _validate_times(values: list[str]) -> list[str]:
    cleaned: list[str] = []
    for value in values:
        text = (value or "").strip()
        if not TIME_PATTERN.match(text):
            raise ValueError("Times must be in 24-hour HH:MM format, for example 08:00.")
        cleaned.append(text)

    unique = sorted(set(cleaned))
    if len(unique) != len(cleaned):
        raise ValueError("The same time is listed twice.")
    if len(unique) > MAX_TIMES_PER_MEDICATION:
        raise ValueError(
            f"A medication can have at most {MAX_TIMES_PER_MEDICATION} reminders a day."
        )
    return unique


class ReminderScheduleIn(BaseModel):
    """The confirmed set of times for one medication. Replaces what is there."""

    times: list[str] = Field(default_factory=list)

    @field_validator("times")
    @classmethod
    def _times_are_valid(cls, values: list[str]) -> list[str]:
        return _validate_times(values)


class ReminderOut(BaseModel):
    id: str
    medication_id: str
    time_of_day: str
    enabled: bool

    model_config = {"from_attributes": True}


class MedicationScheduleOut(BaseModel):
    """
    Everything a screen needs to show one medication's reminders.

    `frequency` is included verbatim so the UI can always show the directions
    beside the times, and the user is comparing the alarm against the label
    rather than trusting it on its own.
    """

    medication_id: str
    medication_name: str
    dosage: str | None
    frequency: str | None
    reminders: list[ReminderOut]


class SuggestionOut(BaseModel):
    """
    Times MedHelp proposes for a medication, which nobody has agreed to yet.

    `recognised` false is an ordinary outcome, not an error: it means the
    directions were not a plain daily rhythm and the user should choose their
    own times. `reason` says why, in words meant for them.
    """

    recognised: bool
    times: list[str]
    doses_per_day: int | None
    reason: str | None
    # Repeated here so the screen showing the suggestion can put the printed
    # directions next to it without a second request.
    frequency: str | None
