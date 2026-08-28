import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MedicationReminder(Base):
    """
    Placeholder model for medication reminders.

    medication_name / dosage / schedule are exactly the kind of fields
    CLAUDE.md's "Data Rules" flags for encryption-at-rest before this ships
    with real user data — not implemented yet, tracked as a known gap.
    """

    __tablename__ = "medication_reminders"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    medication_name: Mapped[str] = mapped_column(String, nullable=False)
    dosage: Mapped[str] = mapped_column(String, nullable=True)
    schedule: Mapped[str] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
