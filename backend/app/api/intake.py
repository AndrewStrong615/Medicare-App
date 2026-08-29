"""
Symptom intake and urgency estimate.

The tier comes from `app.core.triage` (deterministic red-flag screening plus a
model, resolved toward more care). Self-care reading material comes from
MedlinePlus. The model never writes the health content the user reads — it
only estimates urgency and explains that estimate.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.core.emergency import RESULT_DISCLAIMER
from app.core.triage import Tier, TriageUnavailable, assess
from app.db.session import get_db
from app.models.intake import IntakeAssessment
from app.models.user import User
from app.schemas.intake import (
    IntakeFeedbackRequest,
    IntakeRequest,
    IntakeResponse,
)
from app.schemas.symptom import EmergencyGuidanceOut, SymptomTopicOut
from app.services.medlineplus import MedlinePlusUnavailable, search_topics

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/intake", tags=["intake"])

INTAKE_DISCLAIMER = (
    "This is an estimate of how soon you may need care. It is not a diagnosis "
    "and not medical advice. It is a suggestion, not a determination — you can "
    "always seek a higher level of care than this suggests, and you should if "
    "you are worried."
)

ESCALATION_GUIDANCE = (
    "If your symptoms change, get worse, or you become worried at any point, "
    "do not wait for this app. Call 911 or your local emergency number, or go "
    "to an emergency department."
)

SELF_CARE_SOURCE_NOTE = (
    "General information from MedlinePlus, published by the US National "
    "Library of Medicine. It is not tailored to you."
)


async def _self_care_topics(description: str) -> list[SymptomTopicOut]:
    """
    Reading material for the SELF_CARE tier, from a vetted source.

    A failure here is not fatal: the tier and the escalation path matter far
    more than the article, so an outage returns an empty list rather than
    failing the whole assessment.
    """
    try:
        topics = await search_topics(description, limit=3)
    except MedlinePlusUnavailable:
        logger.warning("MedlinePlus unavailable for self-care content.")
        return []
    return [SymptomTopicOut(**topic.__dict__) for topic in topics]


@router.post("/assess", response_model=IntakeResponse, status_code=status.HTTP_201_CREATED)
async def create_assessment(
    payload: IntakeRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> IntakeResponse:
    try:
        result = assess(payload.description)
    except TriageUnavailable as exc:
        # Deliberately a failure, not a tier. Telling someone "probably fine"
        # because a service was down is the worst possible outcome here.
        logger.warning("Triage unavailable: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "We couldn't assess this right now. Please don't wait on the "
                "app: if you feel unwell, contact a healthcare professional, "
                "and call 911 or your local emergency number if this may be "
                "an emergency."
            ),
        ) from exc

    self_care_topics: list[SymptomTopicOut] = []
    if result.tier is Tier.SELF_CARE:
        self_care_topics = await _self_care_topics(payload.description)

    record_id: str | None = None
    if payload.consent_to_store:
        # Stored only with explicit consent; see the PHI note on the model.
        record = IntakeAssessment(
            user_id=user.id,
            description=payload.description,
            tier=result.tier.wire_value,
            reasoning=result.reasoning,
            model_tier=result.model_tier.wire_value if result.model_tier else None,
            model_id=result.model_id,
            red_flag_match=result.red_flag_match,
            escalated_by_safety_net=result.escalated_by_safety_net,
            consented_to_logging=True,
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        record_id = record.id

    return IntakeResponse(
        id=record_id,
        tier=result.tier.wire_value,
        reasoning=result.reasoning,
        red_flag_match=result.red_flag_match,
        escalated_by_safety_net=result.escalated_by_safety_net,
        emergency=(
            EmergencyGuidanceOut(**result.emergency.__dict__) if result.emergency else None
        ),
        self_care_topics=self_care_topics,
        self_care_source_note=SELF_CARE_SOURCE_NOTE if self_care_topics else None,
        disclaimer=INTAKE_DISCLAIMER,
        escalation_guidance=ESCALATION_GUIDANCE,
    )


@router.post("/{assessment_id}/feedback", status_code=status.HTTP_204_NO_CONTENT)
def report_assessment(
    assessment_id: str,
    payload: IntakeFeedbackRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    """Record that a user thought the tier was wrong, for later review."""
    record = (
        db.query(IntakeAssessment)
        .filter(
            IntakeAssessment.id == assessment_id,
            IntakeAssessment.user_id == user.id,
        )
        .first()
    )
    if record is None:
        raise HTTPException(status_code=404, detail="Assessment not found.")

    record.user_reported_wrong = payload.reported_wrong
    db.commit()
