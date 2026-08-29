import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Medication(Base):
    """
    A medication the user is taking.

    Every column except the identifiers is health data about a specific
    person. Per CLAUDE.md's data rules these fields are the ones that need
    encryption at rest before this holds real user data — not implemented
    yet, and recorded as an open finding.

    Rows are always scoped to `user_id`; no query in the app may read
    medications without filtering on the authenticated user.
    """

    __tablename__ = "medications"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False, index=True
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    dosage: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # Free text ("twice daily", "every 8 hours"). Structured scheduling for
    # reminders is built in the next feature.
    frequency: Mapped[str | None] = mapped_column(String(120), nullable=True)
    prescribing_doctor: Mapped[str | None] = mapped_column(String(200), nullable=True)
    refill_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
