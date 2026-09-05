from typing import Literal

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
    # Answers to the follow-up prompts, keyed by question id. Present on any
    # submission after the first. Merged into the description server-side so
    # the combined text is re-screened from the top — see app/core/followup.py.
    #
    # A later round carries the earlier rounds' answers too: the server reads
    # which round this is from the ids present, so the cap on asking cannot be
    # talked past by a client that reports its own round number.
    follow_up_answers: dict[str, str] | None = None


class FollowUpQuestionOut(BaseModel):
    question_id: str
    prompt: str
    kind: str  # "text" | "choice"
    choices: list[str]
    helper: str


class NeedsDetailResponse(BaseModel):
    """
    Returned instead of a tier when the description was not understood.

    Deliberately carries no tier, not even a provisional one: showing an
    urgency estimate beside a request for more detail would invite the user to
    act on a number the app has just said it cannot stand behind. Emergency
    guidance is never withheld this way — a red-flag description skips the
    questions entirely and gets its assessment immediately.
    """

    status: Literal["needs_detail"] = "needs_detail"
    # Which round of questions this is, 1-based. The client shows it so a
    # second set does not look like the first set repeating, and echoes the
    # earlier answers back so the server can merge the whole picture.
    round: int = 1
    intro: str
    questions: list[FollowUpQuestionOut]
    # Repeated here because the client renders this screen without an
    # assessment to read them from.
    disclaimer: str
    escalation_guidance: str


class IntakeRecapEntryOut(BaseModel):
    label: str
    value: str


class IntakeRecapOut(BaseModel):
    """
    What the app heard back from the follow-up questions, and what it still
    does not know.

    Strictly a receipt: `value` is the user's own text, and `label` is a fixed
    field heading. Nothing here is inferred, and no condition is ever named —
    see `summarise` in app/core/followup.py.
    """

    understood: list[IntakeRecapEntryOut]
    unclear: list[str]


class IntakeResponse(BaseModel):
    status: Literal["assessed"] = "assessed"
    id: str | None  # null when the user did not consent to storage
    tier: str  # EMERGENT | URGENT | SELF_CARE
    reasoning: str

    # True when deterministic red-flag screening matched, independent of the
    # model. Surfaced so the UI can be honest about why it escalated.
    red_flag_match: bool
    escalated_by_safety_net: bool
    emergency: EmergencyGuidanceOut | None

    # Background reading matched to the description, sourced from MedlinePlus
    # and rendered verbatim — never written by the model. Populated on every
    # tier except EMERGENT, where the only thing worth showing is how to get
    # emergency help. Empty when the source matched nothing or was down; the
    # app has no fallback content and must not invent any.
    related_topics: list[SymptomTopicOut]
    topics_source_note: str | None
    # True when the reading-material feature is switched off entirely, as
    # opposed to switched on and having matched nothing. The client needs the
    # difference: "we found nothing for you" is the wrong thing to say when
    # nothing was ever looked up.
    topics_disabled: bool = False

    # Present only when follow-up questions were answered. Lets the result
    # screen say what it took from the answers and what is still blank, which
    # is the honest explanation for a default tier.
    summary: IntakeRecapOut | None = None

    # Safety copy the client must render. Sent from the server so there is one
    # reviewable source of truth rather than per-screen restatements.
    disclaimer: str
    escalation_guidance: str


class IntakeFeedbackRequest(BaseModel):
    """Lets a user say the tier felt wrong — the key signal for later review."""

    reported_wrong: bool = True
