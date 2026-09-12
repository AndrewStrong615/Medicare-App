"""
Health goals: what the person said they intend to do, and what they ticked off.

Every column here is health data about a named person - what they are working
on, and on which days they did it. The rules from `models/medication.py` apply
unchanged: rows are always scoped to `user_id`, and these are among the columns
that need encryption at rest before this holds real user data. Not implemented,
recorded as an open finding in CLAUDE.md.

## This is not an adherence record

`GoalCompletion` rows say only that a person pressed a button on a day. They do
not say a person did or did not do something, and nothing in this app may
present them that way - the same rule that makes a passed medication reminder
read "earlier today" rather than "missed". An absent row means nothing was
ticked, which is not evidence of anything.

There is deliberately no streak column, no score, and no percentage stored. A
count of ticks is a count of ticks; anything derived from it that sounds like a
judgement about the person's health would be a clinical fact this app invented.
"""

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class HealthGoal(Base):
    """A goal the person wrote, with the activities they named."""

    __tablename__ = "health_goals"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False, index=True
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    # Exactly what the person typed, kept so the activities can always be read
    # back against their own words. Never re-sent anywhere.
    description: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    activities: Mapped[list["GoalActivity"]] = relationship(
        back_populates="goal",
        cascade="all, delete-orphan",
        order_by="GoalActivity.position",
    )


class GoalActivity(Base):
    """
    One trackable activity, in the person's own words.

    `text` reached here either straight from the person or through
    `core/goal_structuring.py`, which may only rearrange what they wrote. In
    both cases the person saw it on screen and pressed save before this row
    existed.
    """

    __tablename__ = "goal_activities"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    goal_id: Mapped[str] = mapped_column(
        String, ForeignKey("health_goals.id"), nullable=False, index=True
    )

    text: Mapped[str] = mapped_column(String(300), nullable=False)
    # "daily" | "times_per_week" | "unspecified". Stored as written rather than
    # as an enum so an unrecognised value can never silently become a schedule.
    cadence: Mapped[str] = mapped_column(String(20), nullable=False)
    times_per_week: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Verbatim, e.g. "20 minutes". Never parsed into a number, for the same
    # reason a sig line is never expanded.
    quantity_text: Mapped[str | None] = mapped_column(String(120), nullable=True)
    preferred_time: Mapped[str] = mapped_column(String(20), nullable=False)

    # The daily schedule, added 2026-09-12.
    #
    # `days` is a comma-separated list of lowercase day names in week order,
    # e.g. "monday,wednesday,friday". Stored as text rather than as seven
    # booleans or a bitmask because it is read far more often than it is
    # queried, and a row a person can read in a database client is worth more
    # here than a byte saved. Empty string means no particular day.
    #
    # ⛔ `time_of_day` is a LOCAL WALL CLOCK "HH:MM", never a UTC instant -
    # the same rule as `medication_reminders`. Eight in the morning means
    # eight in the morning wherever the person is, and storing an instant
    # would move someone's plan the moment they travelled. Null means no
    # particular time, which is what an activity read out of the person's own
    # words has until they set one.
    days: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    time_of_day: Mapped[str | None] = mapped_column(String(5), nullable=True)

    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    goal: Mapped["HealthGoal"] = relationship(back_populates="activities")


class GoalCompletion(Base):
    """
    A person ticked this activity on this day.

    `completed_on` is a local calendar date sent by the client, never a UTC
    instant - "I did this on Tuesday" must not move because someone travelled.
    Same reasoning as a reminder time being a wall-clock "HH:MM".
    """

    __tablename__ = "goal_completions"
    __table_args__ = (
        UniqueConstraint("activity_id", "completed_on", name="uq_goal_completion_day"),
    )

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    activity_id: Mapped[str] = mapped_column(
        String, ForeignKey("goal_activities.id"), nullable=False, index=True
    )
    completed_on: Mapped[date] = mapped_column(Date, nullable=False)
