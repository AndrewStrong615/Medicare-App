"""
Client for the MedlinePlus health-topics web service.

MedlinePlus is published by the US National Library of Medicine (part of NIH).
All consumer-facing symptom and condition text in this app comes from here —
the app never writes its own medical content (see CLAUDE.md).

Service: https://wsearch.nlm.nih.gov/ws/query?db=healthTopics&term=...
No API key is required. Responses are XML; summaries are HTML fragments with
<span class="qtN"> highlight markup wrapped around the matched search terms.

Attribution is carried on every result (`source_name` / `url`) so the UI can
credit NLM and link back to the full topic page.
"""

from __future__ import annotations

import html
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field

import httpx

MEDLINEPLUS_ENDPOINT = "https://wsearch.nlm.nih.gov/ws/query"
SOURCE_NAME = "MedlinePlus, US National Library of Medicine"
REQUEST_TIMEOUT_SECONDS = 10.0

# Largest response we will read into memory. A search for five topics returns a
# few tens of KB; anything approaching this is not a search result. The cap
# exists so a hostile or broken endpoint - or anything sitting between us and
# it - cannot exhaust this process's memory by streaming without end.
MAX_RESPONSE_BYTES = 4 * 1024 * 1024


class MedlinePlusUnavailable(Exception):
    """Raised when the upstream service cannot be reached or read."""


@dataclass(frozen=True)
class SymptomTopic:
    topic_id: str
    title: str
    summary: str
    url: str
    source_name: str
    groups: list[str]
    # The source's OWN alternate names for this topic (`altTitle` in the XML).
    # NLM says, for example, that "Toe Injuries and Disorders" is also called
    # "Bunions" and that "Sun Exposure" is also called "Sunburn".
    #
    # Kept because matching a description against the title alone throws away
    # the source's own vocabulary: someone who writes "bunions" is written off
    # as having matched nothing, even though NLM has just said that is the
    # name of the topic it returned. Using these is still a lexical test
    # against words the user wrote — it just uses the publisher's synonym list
    # instead of pretending the title is the only name a topic has.
    #
    # Not rendered anywhere. Match input only.
    alt_titles: list[str] = field(default_factory=list)


# The service marks search-term hits with <span class="qtN">…</span>.
_HIGHLIGHT_RE = re.compile(r"</?span[^>]*>", re.IGNORECASE)
_BLOCK_BREAK_RE = re.compile(r"</(p|li|ul|ol|div|h\d)>", re.IGNORECASE)
# <br> is self-closing, so the closing-tag pattern above never sees it; without
# this, lines the source separated would silently run together.
_LINE_BREAK_RE = re.compile(r"<br\s*/?>", re.IGNORECASE)
_LIST_ITEM_RE = re.compile(r"<li[^>]*>", re.IGNORECASE)
_TAG_RE = re.compile(r"<[^>]+>")
_MULTI_NEWLINE_RE = re.compile(r"\n{3,}")
_TRAILING_SPACE_RE = re.compile(r"[ \t]+\n")


def strip_markup(raw: str | None) -> str:
    """
    Convert a MedlinePlus HTML fragment to readable plain text.

    Structure is preserved as line breaks and "• " bullets rather than
    dropped, because these summaries lean heavily on lists and running them
    into one paragraph makes them noticeably harder to read.
    """
    if not raw:
        return ""

    text = _HIGHLIGHT_RE.sub("", raw)
    text = _LIST_ITEM_RE.sub("\n• ", text)
    text = _LINE_BREAK_RE.sub("\n", text)
    text = _BLOCK_BREAK_RE.sub("\n", text)
    text = _TAG_RE.sub("", text)
    # Entities are decoded last so that any &lt;b&gt; in the source text
    # becomes literal "<b>" rather than being treated as markup to remove.
    text = html.unescape(text)
    text = _TRAILING_SPACE_RE.sub("\n", text)
    text = _MULTI_NEWLINE_RE.sub("\n\n", text)
    return text.strip()


def _topic_id_from_url(url: str) -> str:
    """medlineplus.gov/chestpain.html -> "chestpain" (stable, URL-safe)."""
    tail = url.rstrip("/").rsplit("/", 1)[-1]
    return tail.removesuffix(".html")


# A document type declaration is the only way an XML payload can define
# entities, and entity expansion ("billion laughs") is the one attack
# ElementTree does not defend against on its own. This response is a search
# result from a fixed https endpoint and never legitimately carries a DTD, so
# refusing one outright costs nothing and removes the class.
_DOCTYPE_RE = re.compile(r"<!\s*(DOCTYPE|ENTITY)", re.IGNORECASE)


def parse_search_response(xml_text: str) -> list[SymptomTopic]:
    """Parse the service's XML into topics, skipping any malformed entry."""
    if _DOCTYPE_RE.search(xml_text):
        raise MedlinePlusUnavailable(
            "MedlinePlus returned a response we could not read."
        )

    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        raise MedlinePlusUnavailable("MedlinePlus returned a response we could not read.") from exc

    topics: list[SymptomTopic] = []

    for document in root.iter("document"):
        url = document.get("url") or ""
        if not url:
            continue

        title = ""
        summary = ""
        groups: list[str] = []
        alt_titles: list[str] = []

        for content in document.findall("content"):
            name = content.get("name")
            # itertext() keeps text that sits after nested highlight spans,
            # which .text alone would silently drop.
            value = "".join(content.itertext())

            if name == "title":
                title = strip_markup(value)
            elif name == "FullSummary":
                summary = strip_markup(value)
            elif name == "snippet" and not summary:
                summary = strip_markup(value)
            elif name == "groupName":
                group = strip_markup(value)
                if group:
                    groups.append(group)
            elif name == "altTitle":
                alt_title = strip_markup(value)
                if alt_title:
                    alt_titles.append(alt_title)

        if not title:
            continue

        topics.append(
            SymptomTopic(
                topic_id=_topic_id_from_url(url),
                title=title,
                summary=summary,
                url=url,
                source_name=SOURCE_NAME,
                groups=groups,
                alt_titles=alt_titles,
            )
        )

    return topics


async def search_topics(term: str, *, limit: int = 10) -> list[SymptomTopic]:
    """Search MedlinePlus health topics for `term`."""
    params = {
        "db": "healthTopics",
        "term": term,
        "retmax": str(limit),
    }

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.get(MEDLINEPLUS_ENDPOINT, params=params)
            response.raise_for_status()

            if len(response.content) > MAX_RESPONSE_BYTES:
                raise MedlinePlusUnavailable(
                    "MedlinePlus returned a response we could not read."
                )
    except httpx.HTTPError as exc:
        # Callers turn this into a 503 with a plain-language message; the app
        # must never fall back to inventing content when the source is down.
        raise MedlinePlusUnavailable(
            "We couldn't reach the MedlinePlus health library."
        ) from exc

    return parse_search_response(response.text)
