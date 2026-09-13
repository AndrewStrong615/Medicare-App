"""
Guards the triage measurement corpus, and pins the misses it found.

Two jobs:

1. Keep the corpus well-formed, so a number out of `measure.py` means what the
   script says it means.
2. **Pin the under-triage set.** The harness found four descriptions of
   life-threatening presentations that the phrase lists return URGENT for
   instead of EMERGENT. They are listed here rather than fixed, because
   `emergency.py` is fenced by CLAUDE.md and adding phrases to it needs the
   owner's explicit approval — the same basis the 2026-09-06/07 phrase
   additions record. Pinning them means a *fifth* one breaks the build, so
   this file is a sensitivity ratchet: screening can get better without
   touching this test, and cannot get quietly worse.

The scripts directory is not a package — matching `topic_retrieval_eval`,
which is not one either — so the corpus is imported by path.
"""

import importlib.util
import sys
from pathlib import Path

import pytest

from app.core import rules_triage

_CORPUS_PATH = (
    Path(__file__).resolve().parent.parent / "scripts" / "triage_eval" / "corpus.py"
)


def _load_corpus():
    spec = importlib.util.spec_from_file_location("triage_eval_corpus", _CORPUS_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules["triage_eval_corpus"] = module
    spec.loader.exec_module(module)
    return module


corpus = _load_corpus()


# Descriptions the corpus shows are under-triaged today. Every one is a
# contiguous-phrase miss: the concept is named, but not in the exact character
# sequence the list spells.
#
# ⛔ REPORTED, NOT FIXED. Each needs a phrase added to a fenced module:
#
#   "crushing pressure in my chest"          cardiac has "chest pressure" and
#                                            "crushing chest", neither of which
#                                            is "pressure in my chest"
#   "I hit my head hard and feel awful"      bleeding_trauma has "head injury"
#   "thinking about hurting myself"          self_harm has "hurt myself", which
#                                            does not match "hurting myself"
#   "a curtain came over my eye"             vision_loss has "curtain over my
#                                            eye"
#
# Do not "fix" this test by deleting entries. Removing one means either the
# phrase was added (good — delete it then, with the approval recorded) or the
# corpus case was weakened (not good).
KNOWN_UNDER_TRIAGED: frozenset[str] = frozenset(
    {
        "crushing pressure in my chest",
        "I hit my head hard and feel awful",
        "I have been thinking about hurting myself",
        "it is like a curtain came over my eye",
    }
)


def _scored_cases():
    return [c for c in corpus.CASES if not c.basis.startswith("documented gap")]


# ---------------------------------------------------------------------------
# The corpus is well-formed.
# ---------------------------------------------------------------------------


def test_every_case_has_a_valid_gold_tier():
    for case in corpus.CASES:
        assert case.gold in corpus.TIERS, (
            f"{case.description!r} has gold {case.gold!r}, which is not a tier"
        )


def test_every_case_records_where_its_label_came_from():
    for case in corpus.CASES:
        assert case.basis.strip(), (
            f"{case.description!r} has no basis. A gold urgency label with no "
            "recorded provenance is an unreviewable clinical judgement."
        )


def test_no_duplicate_descriptions_inside_a_section():
    """
    A description may appear twice only if one copy is a documented gap.

    Duplicates otherwise silently double a case's weight in every percentage.
    """
    scored = [c.description for c in _scored_cases()]
    duplicates = {d for d in scored if scored.count(d) > 1}
    assert not duplicates, f"duplicated scored descriptions: {duplicates}"


def test_the_corpus_covers_all_three_tiers():
    golds = {c.gold for c in _scored_cases()}
    assert golds == set(corpus.TIERS)


def test_most_cases_are_natural_phrasings():
    """
    The point of the corpus is paraphrases, not the phrase lists read back.

    If this ever inverts, the headline accuracy number stops measuring
    anything: matching your own list is trivially easy.
    """
    scored = _scored_cases()
    natural = [c for c in scored if c.natural]
    assert len(natural) > len(scored) / 2


def test_self_care_cases_carry_no_escalating_modifier():
    """
    A gold label of SELF_CARE is wrong if the text escalates by design.

    `_ESCALATING_MODIFIERS` revokes self-care, so "a sore throat for a week"
    is correctly URGENT and a corpus that labels it SELF_CARE would be
    measuring the rules against a mistake.
    """
    for case in _scored_cases():
        if case.gold != "SELF_CARE":
            continue
        text = rules_triage.normalize_query(case.description)
        hits = [
            phrase
            for phrase, pattern in rules_triage._MODIFIER_COMPILED
            if pattern.search(text)
        ]
        assert not hits, (
            f"{case.description!r} is labelled SELF_CARE but contains "
            f"escalating modifier(s) {hits}"
        )


# ---------------------------------------------------------------------------
# The ratchet.
# ---------------------------------------------------------------------------


def test_no_gold_emergent_case_is_ever_returned_as_self_care():
    """
    The catastrophic direction. This must be zero, always, no exceptions.

    An EMERGENT presentation answered with reassurance is the one failure this
    whole architecture exists to make impossible.
    """
    offenders = [
        case.description
        for case in corpus.CASES
        if case.gold == "EMERGENT"
        and rules_triage.classify(case.description).tier_name == "SELF_CARE"
    ]
    assert offenders == [], f"EMERGENT answered with SELF_CARE: {offenders}"


def test_the_under_triage_set_has_not_grown():
    """No new under-triage. Screening may improve; it may not regress."""
    under = {
        case.description
        for case in _scored_cases()
        if corpus.TIER_RANK[rules_triage.classify(case.description).tier_name]
        < corpus.TIER_RANK[case.gold]
    }

    new = under - KNOWN_UNDER_TRIAGED
    assert not new, (
        "new under-triaged description(s), which means screening got less "
        f"sensitive: {sorted(new)}"
    )

    fixed = KNOWN_UNDER_TRIAGED - under
    assert not fixed, (
        "these are no longer under-triaged, which is good — remove them from "
        f"KNOWN_UNDER_TRIAGED and record the approval for the phrase additions: {sorted(fixed)}"
    )


def test_the_concept_combinator_gap_stays_closed():
    """The gap option 3 closed must not reopen."""
    result = rules_triage.classify("my neck is stiff and I have a fever")
    assert result.tier_name == "EMERGENT"


@pytest.mark.parametrize(
    "description",
    sorted(KNOWN_UNDER_TRIAGED),
)
def test_known_under_triaged_cases_still_reach_at_least_urgent(description):
    """
    They are misses, but they are not reassurances.

    Each of these falls to the URGENT default rather than SELF_CARE, which is
    the safety net working even where the phrase list failed. Worth asserting
    separately: if one of them ever became SELF_CARE it would go from "a miss"
    to "actively dangerous".
    """
    assert rules_triage.classify(description).tier_name == "URGENT"
