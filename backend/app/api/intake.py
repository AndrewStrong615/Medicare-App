"""
Symptom intake and urgency estimate.

The tier comes from `app.core.triage` (deterministic red-flag screening plus a
model, resolved toward more care). The reading material shown alongside it
comes from MedlinePlus. The model never writes the health content the user
reads — it only estimates urgency and explains that estimate.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core import followup
from app.core.config import settings
from app.core.dependencies import get_current_user
from app.core.triage import Tier, TriageNotConfigured, TriageUnavailable, assess
from app.db.session import get_db
from app.models.intake import IntakeAssessment
from app.models.user import User
from app.schemas.intake import (
    FollowUpQuestionOut,
    IntakeFeedbackRequest,
    IntakeRequest,
    IntakeResponse,
    NeedsDetailResponse,
)
from app.schemas.symptom import EmergencyGuidanceOut, SymptomTopicOut
from app.services.medlineplus import MedlinePlusUnavailable, search_topics
from app.services.search_terms import candidate_queries, content_words, title_matches

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

TOPICS_SOURCE_NOTE = (
    "General information from MedlinePlus, published by the US National "
    "Library of Medicine. These topics were matched to the words you used. "
    "They are not tailored to you and are not a diagnosis."
)

USER_FACING_UNAVAILABLE = (
    "We couldn't assess this right now. Please don't wait on the app: if you "
    "feel unwell, contact a healthcare professional, and call 911 or your "
    "local emergency number if this may be an emergency."
)

# Appended only outside production, so a developer can tell a missing key from
# a real outage.
DEV_CONFIG_HINT = (
    "(Developer note: symptom intake has no Anthropic credentials. Set "
    "ANTHROPIC_API_KEY in backend/.env and restart the server.)"
)


async def _related_topics(description: str) -> list[SymptomTopicOut]:
    """
    Reading material for whatever the user described, from a vetted source.

    The raw description is not searched directly: conversational phrasing
    ("my ankle's been killing me since I rolled it") matches nothing, and that
    empty result is why a tier used to arrive with nothing attached to it.
    `candidate_queries` strips the filler and then broadens a word at a time.

    Results are kept only if the topic title contains a word the user actually
    wrote. The upstream ranking is loose enough to answer "swollen ankle" with
    "Diabetic Heart Disease", and showing that beside someone's description
    would imply a diagnosis. A query whose results all fail that check is
    treated as a miss and the search broadens instead.

    A failure here is not fatal: the tier and the escalation path matter far
    more than the article, so an outage returns an empty list rather than
    failing the whole assessment. Coming back empty-handed is an acceptable
    outcome — the screen says so plainly.
    """
    words = content_words(description)

    for query in candidate_queries(description):
        try:
            topics = await search_topics(query, limit=5)
        except MedlinePlusUnavailable:
            logger.warning("MedlinePlus unavailable for related reading.")
            return []

        relevant = [t for t in topics if title_matches(t.title, words)]
        if relevant:
            return [SymptomTopicOut(**topic.__dict__) for topic in relevant[:3]]

    return []


@router.post("/assess", response_model=None, status_code=status.HTTP_201_CREATED)
async def create_assessment(
    payload: IntakeRequest,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> IntakeResponse | NeedsDetailResponse:
    # Presence of the field, not its truthiness, is what marks a second
    # submission. An empty dict is still an answer to "have you been asked
    # already?", and reading it as falsy let a client that posted `{}` be sent
    # round the question loop again.
    is_second_submission = payload.follow_up_answers is not None
    answers = payload.follow_up_answers or {}
    description = followup.merge(payload.description, answers) if answers else payload.description

    try:
        result = assess(description)
    except TriageUnavailable as exc:
        # Deliberately a failure, not a tier. Telling someone "probably fine"
        # because a service was down is the worst possible outcome here.
        detail = USER_FACING_UNAVAILABLE

        if isinstance(exc, TriageNotConfigured):
            logger.error(
                "Symptom intake is unreachable: no Anthropic credentials are "
                "configured. Set ANTHROPIC_API_KEY in backend/.env (or export "
                "it) and restart the server."
            )
            # Outside production, say why. A developer seeing only "couldn't
            # assess" cannot tell a misconfiguration from an outage; an end
            # user must never see configuration details.
            if settings.environment != "production":
                detail = f"{USER_FACING_UNAVAILABLE} {DEV_CONFIG_HINT}"
        else:
            logger.warning("Triage unavailable: %s", exc)

        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=detail,
        ) from exc

    # Ask before answering, when the rules recognised nothing and there is no
    # red flag. `is_needed` is what enforces that second condition, but the
    # ordering matters too: `assess` has already run, so an emergency
    # description has its guidance in hand before this branch is reached and
    # simply falls past it.
    #
    # Only on the first submission. Once answers come back the user has said
    # what they can, and asking again would trap them in a loop.
    if not is_second_submission and followup.is_needed(
        rules_defaulted=result.rules_defaulted,
        red_flag_match=result.red_flag_match,
    ):
        response.status_code = status.HTTP_200_OK
        return NeedsDetailResponse(
            intro=followup.INTRO,
            questions=[FollowUpQuestionOut(**q.__dict__) for q in followup.QUESTIONS],
            disclaimer=INTAKE_DISCLAIMER,
            escalation_guidance=ESCALATION_GUIDANCE,
        )

    # Reading material for the tiers the user can act on at their own pace.
    #
    # GATED OFF by default (`medlineplus_topics_enabled`). Topic selection is
    # lexical, so a topic sharing one word with the description can be both
    # unrelated and frightening — "my head has been pounding" returns "Head
    # and Neck Cancer". Held until a clinician rules on it; see CLAUDE.md.
    # While gated, no request is made, so nothing reaches NLM either.
    #
    # EMERGENT is excluded regardless. That screen has one job, "call 911
    # now", and blocking it behind a content lookup would delay it for no
    # benefit. This is the opposite of the rule in CLAUDE.md about content
    # outages suppressing emergency guidance: here the guidance is what wins.
    topics_disabled = not settings.medlineplus_topics_enabled
    related_topics: list[SymptomTopicOut] = []
    if not topics_disabled and result.tier is not Tier.EMERGENT:
        related_topics = await _related_topics(description)

    record_id: str | None = None
    if payload.consent_to_store:
        # Stored only with explicit consent; see the PHI note on the model.
        record = IntakeAssessment(
            user_id=user.id,
            description=description,
            tier=result.tier.wire_value,
            reasoning=result.reasoning,
            model_tier=result.model_tier.wire_value if result.model_tier else None,
            model_id=result.model_id,
            rule_tier=result.rule_tier.wire_value if result.rule_tier else None,
            rule_ids=",".join(result.rule_ids) if result.rule_ids else None,
            rules_defaulted=result.rules_defaulted,
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
        related_topics=related_topics,
        topics_source_note=TOPICS_SOURCE_NOTE if related_topics else None,
        topics_disabled=topics_disabled,
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
