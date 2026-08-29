from pydantic import BaseModel


class EmergencyGuidanceOut(BaseModel):
    """Shown above results when a search matches emergency red-flag language."""

    category: str
    headline: str
    action: str
    matched_terms: list[str]


class SymptomTopicOut(BaseModel):
    topic_id: str
    title: str
    # Verbatim text from the source. The app does not summarise, paraphrase,
    # or re-categorise it — doing so would turn sourced material into
    # app-authored medical content.
    summary: str
    url: str
    source_name: str
    # The source's own topic categories, surfaced as "may be associated with"
    # rather than as any claim about the user.
    groups: list[str]


class SymptomSearchResponse(BaseModel):
    query: str
    # Non-null means: render this first, before anything else on the screen.
    emergency: EmergencyGuidanceOut | None
    results: list[SymptomTopicOut]
    care_guidance: str
    disclaimer: str
