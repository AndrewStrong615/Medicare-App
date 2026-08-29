import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class IntakeAssessment(Base):
    """
    Audit trail for symptom intake: what was described, and what tier came back.

    This exists so classifications can be reviewed for accuracy later. A triage
    tool whose decisions cannot be audited cannot be improved or held to
    account, and a clinician reviewing this feature will need exactly these
    rows.

    PHI WARNING. `description` is a free-text account of someone's symptoms —
    among the most sensitive fields in this app. Consequently:

    * A row is written ONLY when the user consented at submission time
      (`consented_to_logging`). Without consent the assessment still runs and
      is still returned; nothing is stored.
    * The column needs encryption at rest before this holds real user data.
      Not implemented — recorded as an open finding in CLAUDE.md.
    * Nothing in this app logs the description to application logs.
    """

    __tablename__ = "intake_assessments"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False, index=True
    )

    description: Mapped[str] = mapped_column(Text, nullable=False)

    # The tier shown to the user, after the safety net was applied.
    tier: Mapped[str] = mapped_column(String(20), nullable=False)
    reasoning: Mapped[str] = mapped_column(Text, nullable=False)

    # What the model alone said, kept separately so reviewers can measure how
    # often the deterministic net had to override it.
    model_tier: Mapped[str | None] = mapped_column(String(20), nullable=True)
    model_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # What the rule layer alone decided, and which named rules fired. This is
    # the column a reviewing clinician works from: the rules are readable, so
    # disagreements can be traced to a specific line rather than to a model's
    # judgement.
    rule_tier: Mapped[str | None] = mapped_column(String(20), nullable=True)
    rule_ids: Mapped[str | None] = mapped_column(String(500), nullable=True)
    rules_defaulted: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    # LOW | MEDIUM | HIGH as reported by the model. Recorded so a reviewer can
    # ask the obvious question — are the wrong calls the low-confidence ones?
    # It never influenced the tier.
    model_confidence: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # The clarifying answers, as a JSON object keyed by question id. The
    # questions themselves are fixed and readable in `app.core.followup`, so
    # only the answers are kept. Same PHI warning as `description`: this is the
    # user's own account of their symptoms and needs the same encryption.
    followup_answers: Mapped[str | None] = mapped_column(Text, nullable=True)

    # True when the clarifying questions were asked and the description still
    # could not be classified, so the safe default was applied. The rows a
    # reviewer should read first.
    exhausted_followup: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    red_flag_match: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    escalated_by_safety_net: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    # Recorded on the row itself: a row exists only with consent, and this
    # documents that fact at the point of storage.
    consented_to_logging: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    # Set if the user says the tier felt wrong — the signal a reviewer most
    # wants when auditing accuracy.
    user_reported_wrong: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    schema_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
