"""
Concept-level matching, for red flags the phrase lists cannot express.

WHY THIS EXISTS: every phrase in `emergency.py` and `rules_triage.py` is a
contiguous literal, compiled with word boundaries. That works when a person
writes the concepts in the order the list happens to spell them and with
nothing in between, and fails when they do not. `emergency.py` recorded the
failure against itself:

    KNOWN LIMIT ... this list is contiguous phrases, so "my neck is stiff and
    I have a fever" (stiffness and fever named separately, in that order) is
    not recognised ... Catching that would need a two-term combinator.

This module is that combinator. A description is reduced to the set of
concepts it names, and a rule fires when all of a combination's concepts are
present — in any order, at any distance, in any phrasing the lexicon knows.

## What this module may and may not do

* It **names concepts**. It never decides what a concept means, how serious it
  is, or what to do about it. `detect` answers "did the person write about a
  fever?", never "is this fever dangerous?".
* It defines **no user-facing copy at all**. A combination resolves to the id
  of a category that already exists in `emergency.py`, and that category's
  existing reviewed headline and action are what the user sees. There is one
  copy of the instrument and it is not here.
* It contains **no model and no network call**. The lexicon is closed, curated
  and readable line by line, for the same reason the rule layer is a phrase
  list rather than a classifier: a clinician can audit it in an afternoon.
* ⛔ **Every combination below is drawn from copy that already exists in
  `emergency.py`, not invented here.** The `sepsis_meningitis` action text
  already reads "A stiff neck with fever, a rash that does not fade when
  pressed, or confusion with a high fever needs emergency assessment" — three
  named combinations that the phrase list could only detect when written as
  one contiguous string. This module makes detection match the guidance that
  was already there. Adding a combination the existing copy does not name
  would be authoring a new clinical claim and needs the clinical review
  CLAUDE.md requires.

## Direction of effect

Combinations are consulted **only after every literal phrase has been tried
and none matched**, so this can add an emergency detection where there was
none and can never change or remove one. Like `normalize_query`'s
case-boundary split, it is one-directional by construction: it can make
screening more sensitive and cannot make it less.

## Known limits

* The lexicon is lay vocabulary, so an unlisted synonym is still a miss. That
  is the same limit the phrase lists have; it is narrower here because a
  synonym only has to be listed once per concept rather than once per
  combination.
* Detection is lexical, so a concept named in order to deny it ("I took my
  temperature and there was no fever") still counts as named. Combined with a
  second concept that costs an unnecessary emergency notice — the
  over-inclusive direction `emergency.py` is explicit about preferring.
* NOT CLINICALLY VALIDATED. The lexicon was written by a software engineer and
  is subject to the same sign-off as the phrase lists it extends.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field


# ---------------------------------------------------------------------------
# The lexicon. Concept id -> the lay ways people write it.
#
# Entries are orthographic variants and lay synonyms only. Nothing here
# encodes a threshold, a severity or a relationship between concepts — that
# is what the combinations below are for, and they come from existing copy.
# ---------------------------------------------------------------------------

_CONCEPTS: dict[str, tuple[str, ...]] = {
    # Neck stiffness, in the orders people actually write it. The phrase list
    # already has "stiff neck"; what it cannot have is every way of putting
    # the body part before the symptom.
    "stiff_neck": (
        "stiff neck",
        "stiff of neck",
        "neck is stiff",
        "neck feels stiff",
        "neck has gone stiff",
        "neck went stiff",
        "neck stiffness",
        "stiffness in my neck",
        "stiffness in the neck",
        "stiff in my neck",
        "rigid neck",
        "neck is rigid",
        "can't move my neck",
        "cant move my neck",
        "cannot move my neck",
        "can't turn my neck",
        "cant turn my neck",
        "hurts to move my neck",
        "hurts to turn my neck",
        "painful to move my neck",
    ),
    # Any fever. Kept separate from `high_fever` because the existing copy
    # distinguishes them; this module does not decide where the line is, it
    # only reads which of the two the person wrote.
    "fever": (
        "fever",
        "fevers",
        "feverish",
        "a temperature",
        "high temperature",
        "raised temperature",
        "running a temperature",
        "got a temperature",
        "have a temperature",
        "burning up",
        "hot and shivery",
        "shivering and hot",
        "sweats and chills",
        "chills and a fever",
    ),
    # The subset of the above that says "high" in the person's own words. This
    # is orthographic, not a threshold: no number is read and none is implied.
    "high_fever": (
        "high fever",
        "very high fever",
        "really high fever",
        "high temperature",
        "very high temperature",
        "really high temperature",
        "raging fever",
        "burning up",
    ),
    "rash": (
        "rash",
        "a rash",
        "spots",
        "blotches",
        "blotchy",
        "purple spots",
        "red spots",
        "dark spots on my skin",
        "marks on my skin",
        "pinprick spots",
    ),
    # The "glass test" description, in lay phrasing. On its own this means
    # nothing; it is only ever read alongside `rash`.
    # Both apostrophe forms throughout, the same way `emergency.py` carries
    # "can't breathe" and "cant breathe": normalize_query folds a curly
    # apostrophe to an ASCII one, but a person who simply omits it is writing
    # a different string and has to be listed.
    "not_fading": (
        "doesn't fade",
        "doesnt fade",
        "does not fade",
        "don't fade",
        "dont fade",
        "won't fade",
        "wont fade",
        "not fading",
        "doesn't blanch",
        "doesnt blanch",
        "does not blanch",
        "non-blanching",
        "non blanching",
        "doesn't go away when i press",
        "doesnt go away when i press",
        "does not go away when i press",
        "doesn't disappear when i press",
        "doesnt disappear when i press",
        "does not disappear when i press",
        "doesn't fade when i press",
        "doesnt fade when i press",
        "stays when i press",
        "still there when i press",
        "when i press a glass",
        "press a glass",
        "glass test",
    ),
    "confusion": (
        "confused",
        "confusion",
        "disoriented",
        "disorientated",
        "delirious",
        "not making sense",
        "isn't making sense",
        "isnt making sense",
        "making no sense",
        "muddled",
        "can't think straight",
        "cant think straight",
        "very drowsy",
        "hard to rouse",
    ),
}


@dataclass(frozen=True)
class ConceptCombination:
    """
    One rule: every concept in `required` must be named for it to fire.

    `category` names a category that already exists in `emergency.py`, whose
    reviewed headline and action are what the user is shown. `basis` records
    the existing copy this combination was read out of, so a reviewer can
    check that nothing new was claimed here.
    """

    rule_id: str
    category: str
    required: tuple[str, ...]
    basis: str


# ---------------------------------------------------------------------------
# The combinations.
#
# ⛔ All three are read out of the `sepsis_meningitis` action text already in
# `emergency.py`: "A stiff neck with fever, a rash that does not fade when
# pressed, or confusion with a high fever needs emergency assessment."
# Do not add a fourth without the clinical review CLAUDE.md requires — a
# combination the existing copy does not name is a new clinical claim.
# ---------------------------------------------------------------------------

_COMBINATIONS: tuple[ConceptCombination, ...] = (
    ConceptCombination(
        rule_id="stiff_neck_with_fever",
        category="sepsis_meningitis",
        required=("stiff_neck", "fever"),
        basis="sepsis_meningitis action text: 'A stiff neck with fever'",
    ),
    ConceptCombination(
        rule_id="rash_that_does_not_fade",
        category="sepsis_meningitis",
        required=("rash", "not_fading"),
        basis=(
            "sepsis_meningitis action text: 'a rash that does not fade when "
            "pressed'"
        ),
    ),
    ConceptCombination(
        rule_id="confusion_with_high_fever",
        category="sepsis_meningitis",
        required=("confusion", "high_fever"),
        basis="sepsis_meningitis action text: 'confusion with a high fever'",
    ),
)


@dataclass(frozen=True)
class ConceptMatch:
    """A combination that fired, and the words that put each concept there."""

    rule_id: str
    category: str
    concepts: tuple[str, ...]
    matched_terms: list[str] = field(default_factory=list)


def _compile(phrase: str) -> re.Pattern[str]:
    # Same boundary rule as emergency.py and rules_triage.py, so a concept
    # phrase matches in exactly the situations a red-flag phrase would.
    return re.compile(rf"(?<!\w){re.escape(phrase)}(?!\w)", re.IGNORECASE)


_COMPILED: dict[str, tuple[tuple[str, re.Pattern[str]], ...]] = {
    concept: tuple((phrase, _compile(phrase)) for phrase in phrases)
    for concept, phrases in _CONCEPTS.items()
}


def concept_ids() -> tuple[str, ...]:
    """Every concept the lexicon knows. For tests and inspection."""
    return tuple(_CONCEPTS)


def combinations() -> tuple[ConceptCombination, ...]:
    """Every combination rule. For tests and for a reviewer's read."""
    return _COMBINATIONS


def detect(text: str) -> dict[str, list[str]]:
    """
    Which concepts `text` names, and the words that named each one.

    Answers only "was this written about?". It does not rank, score or
    interpret, and it never decides what a concept implies.
    """
    if not text or not text.strip():
        return {}

    found: dict[str, list[str]] = {}
    for concept, compiled in _COMPILED.items():
        hits = [phrase for phrase, pattern in compiled if pattern.search(text)]
        if hits:
            found[concept] = hits
    return found


def screen_combinations(text: str) -> ConceptMatch | None:
    """
    Return the first combination every concept of which is named in `text`.

    `text` is expected to have been through `emergency.normalize_query`
    already — this is called from inside the screening path, after the literal
    phrases have been tried, so it sees the same normalised string they did.

    Returns the first match rather than all of them, for the reason
    `screen_for_emergency` does: one clear instruction beats a wall of
    competing warnings.
    """
    named = detect(text)
    if not named:
        return None

    for combination in _COMBINATIONS:
        if all(concept in named for concept in combination.required):
            matched_terms: list[str] = []
            for concept in combination.required:
                matched_terms.extend(named[concept])
            return ConceptMatch(
                rule_id=combination.rule_id,
                category=combination.category,
                concepts=combination.required,
                matched_terms=matched_terms,
            )

    return None
