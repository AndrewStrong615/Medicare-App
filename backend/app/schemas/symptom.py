from pydantic import BaseModel, Field


class SymptomSearchRequest(BaseModel):
    """
    Search input travels in a POST body, not a URL query string.

    A symptom search is health information about the person typing it. Request
    URLs are captured by default in web-server access logs, reverse proxies,
    CDNs, and mobile crash reporters; request bodies generally are not. See
    CLAUDE.md, "Do not log request/response bodies that contain user health
    data".
    """

    q: str = Field(..., min_length=1, max_length=200)
    limit: int = Field(10, ge=1, le=25)


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
