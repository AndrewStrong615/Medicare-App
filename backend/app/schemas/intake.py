from pydantic import BaseModel, Field

from app.schemas.symptom import EmergencyGuidanceOut, SymptomTopicOut


class IntakeRequest(BaseModel):
    """
    Submitted in a POST body, never a URL: the description is the most
    sensitive free text in the app.
    """

    description: str = Field(..., min_length=1, max_length=2000)
    # Explicit, per-submission consent. Defaults to False so a client that
    # forgets the field stores nothing.
    consent_to_store: bool = False


class IntakeResponse(BaseModel):
    id: str | None  # null when the user did not consent to storage
    tier: str  # EMERGENT | URGENT | SELF_CARE
    reasoning: str

    # True when deterministic red-flag screening matched, independent of the
    # model. Surfaced so the UI can be honest about why it escalated.
    red_flag_match: bool
    escalated_by_safety_net: bool
    emergency: EmergencyGuidanceOut | None

    # Populated for SELF_CARE only, and sourced from MedlinePlus — never
    # written by the model.
    self_care_topics: list[SymptomTopicOut]
    self_care_source_note: str | None

    # Safety copy the client must render. Sent from the server so there is one
    # reviewable source of truth rather than per-screen restatements.
    disclaimer: str
    escalation_guidance: str


class IntakeFeedbackRequest(BaseModel):
    """Lets a user say the tier felt wrong — the key signal for later review."""

    reported_wrong: bool = True
