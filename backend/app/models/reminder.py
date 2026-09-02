import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MedicationReminder(Base):
    """
    One daily reminder time for one medication.

    A medication with three doses a day has three rows. Storing one row per
    time, rather than a list on the medication, is what lets a single time be
    switched off or moved without touching the others.

    ## What is stored, and what is not

    Only the id, the owner, the medication it belongs to, and a wall-clock
    time. The medication *name* is deliberately not copied here: it already
    lives on `medications`, and a second copy would be a second place health
    data leaks from. Anything that needs to show the name joins to get it.

    `time_of_day` is a local wall-clock "HH:MM", not a UTC instant. A reminder
    to take a tablet at eight in the morning means eight in the morning
    wherever the person happens to be, and converting it through a timezone
    would move a medication time when someone travels. The device schedules
    the local alarm; the server only records the intent.

    Rows are always scoped to `user_id`; no query in the app may read
    reminders without filtering on the authenticated user.
    """

    __tablename__ = "medication_reminders"

    # One row per medication per time. Saving the same time twice is a
    # duplicate alarm, not two doses.
    __table_args__ = (
        UniqueConstraint("medication_id", "time_of_day", name="uq_reminder_med_time"),
    )

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False, index=True
    )
    medication_id: Mapped[str] = mapped_column(
        String,
        # Deleting a medication must take its alarms with it. A reminder for a
        # medication the user has removed would tell them to take something
        # they have stopped.
        ForeignKey("medications.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Local wall-clock time, "HH:MM", 24-hour. See the class note.
    time_of_day: Mapped[str] = mapped_column(String(5), nullable=False)

    # Lets someone silence a time without losing it, which is friendlier than
    # deleting and retyping it.
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
