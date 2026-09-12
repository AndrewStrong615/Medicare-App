"""
Request and response shapes for health goals.

A draft and a saved goal are separate types on purpose, the same split as
suggestion-versus-schedule in `schemas/reminder.py`. A draft is something
MedHelp proposed and nobody has agreed to yet; a goal is what the person
confirmed on screen. Keeping them apart in the API makes it hard to
accidentally treat the first as the second.
"""

from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

import re

from app.core.goal_structuring import (
    CADENCES,
    DAYS,
    MAX_ACTIVITIES,
    PREFERRED_TIMES,
)
from app.schemas.symptom import EmergencyGuidanceOut

# A local wall-clock "HH:MM". Same shape the core module accepts, restated
# here because a schema that took anything would let a client store a time
# the screens cannot render.
_TIME = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


class GoalDraftIn(BaseModel):
    """Free text the person wrote about what they intend to do."""

    description: str = Field(..., min_length=1, max_length=2000)


class ActivityIn(BaseModel):
    """
    One activity as the person confirmed it.

    Everything here is editable on screen before it arrives, so these values
    are the person's, whether or not a model proposed them first.
    """

    text: str = Field(..., min_length=1, max_length=300)
    cadence: str = Field(...)
    times_per_week: int | None = Field(None, ge=1, le=7)
    quantity_text: str | None = Field(None, max_length=120)
    preferred_time: str = Field("unspecified")
    # The daily schedule the person confirmed. Both default to "no particular
    # day" and "no particular time" so an activity typed by hand, with no
    # schedule set on it, is still a valid thing to save.
    days: list[str] = Field(default_factory=list, max_length=7)
    time_of_day: str | None = Field(None)

    @field_validator("cadence")
    @classmethod
    def _known_cadence(cls, value: str) -> str:
        if value not in CADENCES:
            raise ValueError("Unrecognised cadence.")
        return value

    @field_validator("preferred_time")
    @classmethod
    def _known_time(cls, value: str) -> str:
        if value not in PREFERRED_TIMES:
            raise ValueError("Unrecognised preferred time.")
        return value

    @field_validator("days")
    @classmethod
    def _known_days(cls, value: list[str]) -> list[str]:
        """
        Day names only, deduplicated, and always in week order.

        Ordering here rather than trusting the client means a schedule reads
        the same however the checkboxes were ticked, and the stored string is
        stable for a given set of days.
        """
        named = {day.strip().lower() for day in value}
        unknown = named - set(DAYS)
        if unknown:
            raise ValueError("Unrecognised day.")
        return [day for day in DAYS if day in named]

    @field_validator("time_of_day")
    @classmethod
    def _wall_clock(cls, value: str | None) -> str | None:
        """
        Refuse a time rather than guess at one.

        "8am", "0800" and "8:00" are rejected for the same reason
        `dose_schedule.py` rejects them: "8" could be either end of the day,
        and an activity put at the wrong one is worse than one with no time.
        """
        if value is None or value.strip() == "":
            return None
        value = value.strip()
        if not _TIME.match(value):
            raise ValueError("Time must be a 24-hour HH:MM.")
        return value


class GoalCreateIn(BaseModel):
    """A goal the person has confirmed and asked to save."""

    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field(..., min_length=1, max_length=2000)
    activities: list[ActivityIn] = Field(..., min_length=1, max_length=MAX_ACTIVITIES)


class ActivityDraftOut(BaseModel):
    """
    A proposed activity.

    `source_phrase` travels to the client so the screen can show the person
    which of their own words each row came from. It is the evidence the server
    already checked, shown rather than merely asserted.

    `generated` is True for a row MedHelp suggested rather than read out of
    what the person wrote, and `source_phrase` is then None. The screen must
    label those: a person has to be able to tell which lines are theirs.
    """

    text: str
    source_phrase: str | None
    cadence: str
    times_per_week: int | None
    quantity_text: str | None
    preferred_time: str
    generated: bool = False
    # The proposed daily schedule. A planned row always carries both; a row
    # read out of the person's own words carries neither, because a clock
    # time it invented would be a quantity they never wrote.
    days: list[str] = []
    time_of_day: str | None = None


class GoalDraftOut(BaseModel):
    """
    What came back from the structuring step, including nothing at all.

    `activities` is empty whenever MedHelp has no proposal - no model
    configured, an outage, a failed check, or a refusal. `notice` is the
    sentence the person reads, written here rather than by the model.

    `emergency` is set when the text matched a red flag. It is returned
    alongside whatever else happened rather than instead of it, and the client
    renders it above everything - the same contract as symptom search, where
    guidance survives a content outage.
    """

    title: str | None
    activities: list[ActivityDraftOut]
    notice: str | None
    emergency: EmergencyGuidanceOut | None = None


class ActivityOut(BaseModel):
    id: str
    text: str
    cadence: str
    times_per_week: int | None
    quantity_text: str | None
    preferred_time: str
    # Week-ordered day names, and a local wall-clock "HH:MM". Either may be
    # empty: an activity with no schedule is a valid activity.
    days: list[str] = []
    time_of_day: str | None = None
    # Whether the person ticked this on the date they asked about. Not an
    # adherence figure - see the note in `models/goal.py`.
    completed_today: bool


class GoalOut(BaseModel):
    id: str
    title: str
    description: str
    created_at: datetime
    activities: list[ActivityOut]


class CompletionIn(BaseModel):
    """
    Tick or untick one activity on one local calendar day.

    The date comes from the client because it is the person's own day. A server
    that used its own clock would move someone's Tuesday - the same reason a
    reminder time is a wall clock rather than a UTC instant.
    """

    completed_on: date
    completed: bool
