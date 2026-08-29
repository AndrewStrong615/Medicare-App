"""
Symptom / condition lookup.

All medical content served here comes from MedlinePlus (US National Library of
Medicine) and is passed through verbatim. This module must never generate,
summarise, or re-categorise clinical text — see CLAUDE.md.

Every response carries a disclaimer and general care guidance, and any query
matching emergency red-flag language carries emergency guidance that the
client renders above the results.
"""

from fastapi import APIRouter, HTTPException, status

from app.core.emergency import (
    GENERAL_CARE_GUIDANCE,
    RESULT_DISCLAIMER,
    screen_for_emergency,
)
from app.schemas.symptom import (
    EmergencyGuidanceOut,
    SymptomSearchRequest,
    SymptomSearchResponse,
    SymptomTopicOut,
)
from app.services.medlineplus import MedlinePlusUnavailable, search_topics

router = APIRouter(prefix="/symptoms", tags=["symptoms"])


# POST rather than GET: the search term is the user's own health information
# and must stay out of URLs, which are logged by default almost everywhere.
@router.post("/search", response_model=SymptomSearchResponse)
async def search_symptoms(payload: SymptomSearchRequest) -> SymptomSearchResponse:
    query = payload.q.strip()
    limit = payload.limit
    if not query:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Enter a symptom or condition to search for.",
        )

    # Screened before the lookup so guidance is still returned even if the
    # upstream library is unavailable.
    emergency = screen_for_emergency(query)

    try:
        topics = await search_topics(query, limit=limit)
    except MedlinePlusUnavailable as exc:
        if emergency:
            # Never withhold emergency guidance because a content service is
            # down: return it with an empty result list instead of a 503.
            return SymptomSearchResponse(
                query=query,
                emergency=EmergencyGuidanceOut(**emergency.__dict__),
                results=[],
                care_guidance=GENERAL_CARE_GUIDANCE,
                disclaimer=RESULT_DISCLAIMER,
            )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "We couldn't reach the health information library just now. "
                "Please check your connection and try again in a moment."
            ),
        ) from exc

    return SymptomSearchResponse(
        query=query,
        emergency=EmergencyGuidanceOut(**emergency.__dict__) if emergency else None,
        results=[SymptomTopicOut(**topic.__dict__) for topic in topics],
        care_guidance=GENERAL_CARE_GUIDANCE,
        disclaimer=RESULT_DISCLAIMER,
    )
