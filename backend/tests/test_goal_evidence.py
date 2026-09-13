"""
The evidence register: what a citation may be, and what it may never become.

The repository owner asked twice for goal plans that are "proven". This module
is the only form of that MedHelp ships — a row attributed to a named public
health body's published recommendation, quoted verbatim, with a link — and
these tests are the difference between that and a model being asked to sound
authoritative.
"""

from __future__ import annotations

import ast
from pathlib import Path
from urllib.parse import urlparse

import pytest

from app.core import goal_evidence, goal_structuring

_APP = Path(__file__).resolve().parent.parent / "app"


# ---------------------------------------------------------------------------
# What is in the register.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("source", goal_evidence._SOURCES, ids=lambda s: s.domain)
def test_every_entry_is_attributable(source):
    """
    A citation with no publisher, no document or no link is not a citation.
    It is a sentence in a box that looks like one.
    """
    assert source.publisher.strip()
    assert source.document.strip()
    assert source.quote.strip()
    assert source.label.strip()
    assert source.retrieved.strip()


@pytest.mark.parametrize("source", goal_evidence._SOURCES, ids=lambda s: s.domain)
def test_every_link_is_https_and_goes_to_a_public_health_body(source):
    """
    ⛔ The whole claim rests on where the text came from.

    A quote is only worth showing if a reader can go and check it, so the link
    has to be reachable and has to be the publisher's own. Restricting the host
    is what stops an entry ever pointing at a blog, a vendor, or a summary of
    the guidance rather than the guidance.
    """
    parsed = urlparse(source.url)

    assert parsed.scheme == "https"
    assert parsed.hostname
    assert parsed.hostname.endswith(".gov"), source.url


@pytest.mark.parametrize("source", goal_evidence._SOURCES, ids=lambda s: s.domain)
def test_a_quote_is_a_whole_published_sentence(source):
    """
    ⛔ VERBATIM AND COMPLETE, OR NOT AT ALL.

    A trimmed fragment needs words of ours to make sense, and words of ours
    inside a quotation is app-authored clinical content wearing a citation —
    strictly worse than no citation, because it borrows an authority it has
    not got.

    A sleep-duration entry was dropped over exactly this: the CDC publishes the
    figure as a table cell ("7 or more hours"), so any sentence carrying it
    would have been written here rather than there.
    """
    assert source.quote == source.quote.strip()
    assert source.quote.endswith("."), source.quote
    assert source.quote[0].isupper(), source.quote
    # Long enough to be a sentence rather than a clipped phrase.
    assert len(source.quote.split()) >= 6, source.quote


def test_the_register_has_no_duplicate_domains():
    assert len(goal_evidence.BY_DOMAIN) == len(goal_evidence._SOURCES)
    assert set(goal_evidence.DOMAINS) == set(goal_evidence.BY_DOMAIN)


# ---------------------------------------------------------------------------
# ⛔ Resolution never guesses.
# ---------------------------------------------------------------------------


def test_an_unknown_domain_resolves_to_nothing_rather_than_to_the_nearest_one():
    """
    The single most important rule here, and the same one the label parser
    follows when it refuses to snap a misread drug name to the nearest real
    drug: a visible gap is better than a plausible error.

    "aerobic" is one character-run away from a real id and still gets nothing.
    """
    for guess in ("aerobic", "activity", "walking", "sleep", "", None, "  "):
        assert goal_evidence.resolve(guess) is None


def test_a_known_domain_resolves_to_its_own_source():
    source = goal_evidence.resolve("aerobic_activity")

    assert source is not None
    assert source.domain == "aerobic_activity"
    assert "cdc.gov" in source.url


def test_resolution_tolerates_case_and_surrounding_space_only():
    assert goal_evidence.resolve("  Aerobic_Activity ") is not None
    # But not a different word. Folding case is not the same as guessing.
    assert goal_evidence.resolve("aerobic activity") is None


# ---------------------------------------------------------------------------
# ⛔ What this may never touch.
# ---------------------------------------------------------------------------


def _imports_of(module: str) -> set[str]:
    tree = ast.parse((_APP / module).read_text(encoding="utf-8"))
    found: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            found.add(node.module)
            found.update(f"{node.module}.{alias.name}" for alias in node.names)
        elif isinstance(node, ast.Import):
            found.update(alias.name for alias in node.names)
    return found


@pytest.mark.parametrize(
    "module",
    ["core/triage.py", "core/rules_triage.py", "core/emergency.py", "core/deduction.py"],
)
def test_nothing_that_estimates_urgency_reads_the_evidence_register(module):
    """
    ⛔ THIS IS ATTRIBUTION FOR A LIFESTYLE ACTIVITY AND NOTHING ELSE.

    A citation must never become an input to a tier, a red flag, or anything
    else that tells somebody how soon to be seen. Those modules are fenced by
    CLAUDE.md and their inputs are phrase lists a clinician can read; a table
    of behaviour guidance is neither reviewed for that purpose nor built for
    it. Asserted against the import statements so it fails as a build rather
    than as a judgement call in review.
    """
    assert not any("goal_evidence" in name for name in _imports_of(module))


def test_the_planner_offers_only_ids_and_never_lets_the_model_write_a_citation():
    """
    A model asked for a citation produces a plausible-looking one. A model
    asked to pick from eight ids either picks one or does not.
    """
    row = goal_structuring.SUGGEST_PLAN["function"]["parameters"]["properties"][
        "activities"
    ]["items"]

    assert row["properties"]["evidence_domain"]["enum"] == list(goal_evidence.DOMAINS)
    # No field anywhere in a row could carry a source of the model's own.
    for banned in ("url", "source", "citation", "publisher", "quote", "study"):
        assert banned not in row["properties"]
    assert row["additionalProperties"] is False


def test_the_prompt_shows_the_register_and_forbids_writing_a_citation():
    prompt = goal_structuring.PLAN_SYSTEM_PROMPT

    for domain in goal_evidence.DOMAINS:
        assert domain in prompt, f"{domain} is not offered to the model"

    assert "Never write a" in prompt
    assert "leave it out" in prompt
    # And the register is spliced in rather than written out again, so the two
    # cannot drift.
    assert goal_evidence.prompt_vocabulary() in prompt
