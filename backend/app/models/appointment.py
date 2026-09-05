import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# The lifecycle of a row here. The distinction that matters is the first one:
# REQUESTED does not mean anyone outside this phone knows about the visit.
#
#   REQUESTED  The user recorded an intent to be seen. MedHelp has NOT
#              contacted the provider — see `app/services/request_delivery.py`
#              for why that channel does not exist yet.
#   SCHEDULED  The user has spoken to the provider and has a real time.
#              Only the user can move a row here; nothing automated does.
#   COMPLETED  The visit happened.
#   CANCELLED  It is not going ahead.
APPOINTMENT_STATUSES = ("REQUESTED", "SCHEDULED", "COMPLETED", "CANCELLED")

# Whether the request ever left this app. Today the only reachable value is
# NOT_SENT, and that is deliberate: no BAA-covered channel exists to send a
# reason-for-visit to a provider. The column exists so that when one does, the
# rows written before it can still be told apart from the rows written after.
DELIVERY_STATES = ("NOT_SENT", "SENT", "FAILED")


class Appointment(Base):
    """
    A visit the user is tracking, and — where they arrived from symptom intake
    — the urgency context that sent them here.

    PHI WARNING. `reason_for_visit` is a free-text account of why someone needs
    to see a doctor. When it is carried over from symptom intake it is a copy
    of that description, which CLAUDE.md identifies as the most sensitive free
    text in the app. Therefore:

    * It never leaves this database. No third party receives it, because no
      third party this app talks to has signed a BAA.
    * It needs encryption at rest before this holds real user data. Not
      implemented — the same open finding as `medications` and
      `intake_assessments`.
    * Nothing in this module logs it.

    Every query filters on `user_id`, like `medications` — an appointment is
    never reachable by id alone.
    """

    __tablename__ = "appointments"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False, index=True
    )

    # A snapshot of the provider as the user chose them, not a foreign key.
    # NPPES rows change — a clinic closes, a taxonomy is recoded — and an
    # appointment record should still say who the user meant to see. The NPI
    # is kept so the current record can be looked up again if needed.
    provider_name: Mapped[str] = mapped_column(String(300), nullable=False)
    provider_npi: Mapped[str | None] = mapped_column(String(20), nullable=True)
    provider_specialty: Mapped[str | None] = mapped_column(String(200), nullable=True)
    provider_phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    provider_address: Mapped[str | None] = mapped_column(String(400), nullable=True)

    # What the user wants to be seen about, and when they would like it.
    # `preferred_time` is free text ("Thursday morning", "as soon as possible")
    # rather than a timestamp: this app cannot see a provider's calendar, so
    # storing a precise slot would imply a booking that does not exist.
    reason_for_visit: Mapped[str | None] = mapped_column(Text, nullable=True)
    preferred_time: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Carried from symptom intake when the user arrived from an URGENT result,
    # so they do not retype it. Advisory only — it is displayed back to the
    # user and never re-evaluated. This app does not re-triage from a stored
    # tier, and nothing here may write to the triage modules.
    urgency_tier: Mapped[str | None] = mapped_column(String(20), nullable=True)
    source_assessment_id: Mapped[str | None] = mapped_column(String, nullable=True)

    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="REQUESTED"
    )
    delivery_state: Mapped[str] = mapped_column(
        String(20), nullable=False, default="NOT_SENT"
    )

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
