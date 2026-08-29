"""
Rule-based urgency classification. No model, no network, no API key.

WHY THIS EXISTS: a triage tool whose logic a clinician can read line by line
is reviewable in an afternoon. Measuring a language model's judgement against
a labelled corpus is a research project. This layer is also free, works
offline, reproducible for a given input, and sends nothing to a third party —
which removes symptom text from the list of things needing a vendor BAA.

THE CENTRAL DESIGN RULE: SELF_CARE must be positively earned. It is never a
fallback. Text this module does not recognise resolves to URGENT, because
"no rule matched" means "we do not understand this", not "this is fine".
Absence of alarming words is not evidence of safety.

Order of evaluation:

    1. Emergency red flags (app.core.emergency)  -> EMERGENT
    2. Urgent indicators                         -> URGENT
    3. A recognised self-limiting complaint with
       no escalating modifier                    -> SELF_CARE
    4. Anything else                             -> URGENT   (the safe default)

NOT CLINICALLY VALIDATED. Every phrase list below was written by a software
engineer. These are lay-language triggers, not a clinical rule set, and the
whole module is subject to the clinician sign-off recorded in CLAUDE.md.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.core.emergency import EmergencyGuidance, normalize_query, screen_for_emergency


@dataclass(frozen=True)
class RuleMatch:
    """One rule that fired, kept so a reviewer can see why a tier was chosen."""

    rule_id: str
    explanation: str
    matched_terms: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class RuleClassification:
    tier_name: str  # "EMERGENT" | "URGENT" | "SELF_CARE"
    reasoning: str
    matches: list[RuleMatch]
    emergency: EmergencyGuidance | None
    # True when nothing was recognised and the safe default was applied.
    defaulted: bool


# ---------------------------------------------------------------------------
# URGENT indicators: be seen soon, but not emergency services.
# Each entry: rule id, user-facing explanation, trigger phrases.
# ---------------------------------------------------------------------------

_URGENT_RULES: list[tuple[str, str, tuple[str, ...]]] = [
    (
        "possible_fracture",
        "what you described can involve a bone or joint injury, which usually "
        "needs to be looked at and imaged",
        (
            "broke my", "broken", "fracture", "fractured",
            "can't put weight", "cant put weight", "can't bear weight",
            "cant bear weight", "can't walk on", "cant walk on",
            "bone is", "looks deformed", "bent the wrong way",
            "dislocated", "popped out",
        ),
    ),
    (
        "wound_needs_review",
        "wounds like this often need to be cleaned, closed, or checked for "
        "infection",
        (
            "deep cut", "won't stop bleeding", "wont stop bleeding",
            "might need stitches", "need stitches", "gaping",
            "puncture wound", "animal bite", "dog bite", "cat bite",
            "human bite", "rusty nail",
        ),
    ),
    (
        "infection_signs",
        "signs like these can mean an infection that needs treatment rather "
        "than time",
        (
            "spreading redness", "red streaks", "pus", "oozing",
            "wound is hot", "getting more swollen", "abscess", "boil",
            "infected",
        ),
    ),
    (
        "persistent_or_worsening",
        "something that keeps going or is getting worse is worth having "
        "looked at rather than waited out",
        (
            "getting worse", "getting much worse", "keeps getting worse",
            "won't go away", "wont go away", "not getting better",
            "for weeks", "for a week", "for several days", "for two weeks",
            "for a month", "for months",
        ),
    ),
    (
        "fever_with_duration",
        "a fever that persists is usually worth having assessed",
        (
            "high fever", "fever for days", "fever for a week",
            "temperature of 103", "temperature of 104", "fever won't break",
            "fever wont break",
        ),
    ),
    (
        "cannot_keep_fluids_down",
        "not being able to keep fluids down can lead to dehydration and "
        "usually needs assessment",
        (
            "can't keep anything down", "cant keep anything down",
            "can't keep fluids", "cant keep fluids",
            "vomiting everything", "throwing up everything",
            "haven't been able to drink", "havent been able to drink",
            "dehydrated",
        ),
    ),
    (
        "eye_symptoms",
        "eye symptoms are usually assessed promptly because sight is hard to "
        "recover once lost",
        (
            "eye pain", "something in my eye", "chemical in my eye",
            "eye is red and painful", "blurry in one eye",
            "light hurts my eyes", "photophobia",
        ),
    ),
    (
        "new_lump_or_unexplained_change",
        "new or unexplained changes are usually checked rather than watched",
        (
            "new lump", "found a lump", "unexplained weight loss",
            "losing weight without", "mole has changed", "mole changed",
            "night sweats",
        ),
    ),
    (
        "medication_reaction",
        "reactions to a medicine usually need a clinician's input before you "
        "change anything",
        (
            "reaction to my medication", "reaction to the medicine",
            "since starting the medication", "new rash after taking",
            "side effect",
        ),
    ),
    (
        "pregnancy_related",
        "symptoms during pregnancy are usually assessed promptly",
        ("pregnant", "pregnancy", "weeks pregnant"),
    ),
    (
        "infant_or_young_child",
        "symptoms in a baby or very young child are usually assessed promptly",
        (
            "my baby", "my newborn", "my infant", "months old",
            "weeks old", "my toddler",
        ),
    ),
    (
        "severe_pain",
        "pain at this level is usually assessed rather than managed at home",
        (
            "severe pain", "worst pain", "unbearable", "excruciating",
            "10/10 pain", "agony", "can't sleep from the pain",
            "cant sleep from the pain",
        ),
    ),
]


# ---------------------------------------------------------------------------
# Recognised self-limiting complaints. A match here is necessary but NOT
# sufficient for SELF_CARE — an escalating modifier overrides it.
# ---------------------------------------------------------------------------

_SELF_CARE_PATTERNS: tuple[str, ...] = (
    "sore throat", "scratchy throat",
    "runny nose", "stuffy nose", "blocked nose", "congestion",
    "common cold", "a cold", "sneezing",
    "mild headache", "slight headache", "tension headache",
    "mild cough", "dry cough", "tickly cough",
    "paper cut", "small cut", "minor cut", "grazed", "scraped my",
    "minor burn", "small burn",
    "bruise", "bruised",
    "mild heartburn", "indigestion",
    "hiccups",
    "mosquito bite", "insect bite", "bug bite",
    "hangover",
    "sore muscles", "muscle ache", "aching after exercise",
    "mild sunburn",
    "dry skin", "chapped lips",
    "mild nausea",
)


# ---------------------------------------------------------------------------
# Modifiers that revoke SELF_CARE. If any appear, the description is not the
# ordinary case the self-care list assumes.
# ---------------------------------------------------------------------------

_ESCALATING_MODIFIERS: tuple[str, ...] = (
    "severe", "worst", "unbearable", "excruciating", "agony",
    "sudden", "suddenly", "out of nowhere",
    "getting worse", "worsening", "spreading",
    "won't go away", "wont go away", "not getting better",
    "for weeks", "for a week", "for a month", "for months",
    "high fever", "can't sleep", "cant sleep",
    "pregnant", "my baby", "my newborn", "my infant",
    "immunocompromised", "chemotherapy", "transplant",
    "blood", "bleeding",
    "numb", "numbness", "weakness on one side",
    "confused", "confusion",
)


def _compile(phrase: str) -> re.Pattern[str]:
    return re.compile(rf"(?<!\w){re.escape(phrase)}(?!\w)", re.IGNORECASE)


_URGENT_COMPILED = [
    (rule_id, explanation, tuple((p, _compile(p)) for p in phrases))
    for rule_id, explanation, phrases in _URGENT_RULES
]
_SELF_CARE_COMPILED = tuple((p, _compile(p)) for p in _SELF_CARE_PATTERNS)
_MODIFIER_COMPILED = tuple((p, _compile(p)) for p in _ESCALATING_MODIFIERS)


DEFAULT_REASONING = (
    "MedHelp could not confidently recognise what you described, so it is "
    "suggesting you get it checked rather than assuming it is minor. Not "
    "recognising something is not the same as it being harmless."
)

SELF_CARE_REASONING = (
    "What you described is the kind of thing that usually settles on its own "
    "with rest and time, and does not normally need to be seen. That is a "
    "general pattern, not a judgement about you."
)


def _match_all(
    text: str, compiled: tuple[tuple[str, re.Pattern[str]], ...]
) -> list[str]:
    return [phrase for phrase, pattern in compiled if pattern.search(text)]


def classify(description: str) -> RuleClassification:
    """Classify a description into a tier using explicit rules only."""
    text = normalize_query(description.strip())

    # 1. Emergency red flags. Highest precedence, always evaluated first.
    emergency = screen_for_emergency(text)
    if emergency:
        return RuleClassification(
            tier_name="EMERGENT",
            reasoning=(
                "What you described includes wording commonly associated with "
                "conditions that need immediate evaluation. This app cannot "
                "judge how serious your situation is, so it is treating it as "
                "an emergency."
            ),
            matches=[
                RuleMatch(
                    rule_id=f"emergency:{emergency.category}",
                    explanation="matched emergency red-flag screening",
                    matched_terms=list(emergency.matched_terms),
                )
            ],
            emergency=emergency,
            defaulted=False,
        )

    # 2. Urgent indicators.
    urgent_matches: list[RuleMatch] = []
    for rule_id, explanation, phrases in _URGENT_COMPILED:
        matched = [phrase for phrase, pattern in phrases if pattern.search(text)]
        if matched:
            urgent_matches.append(
                RuleMatch(rule_id=rule_id, explanation=explanation, matched_terms=matched)
            )

    if urgent_matches:
        # Lead with the first rule's explanation so the user gets one clear
        # reason rather than a list of everything that fired.
        primary = urgent_matches[0]
        return RuleClassification(
            tier_name="URGENT",
            reasoning=(
                f"This is being flagged as worth seeing someone about soon "
                f"because {primary.explanation}. This is about how soon to be "
                f"seen — it is not a diagnosis."
            ),
            matches=urgent_matches,
            emergency=None,
            defaulted=False,
        )

    # 3. SELF_CARE must be positively earned AND unmodified.
    self_care_hits = _match_all(text, _SELF_CARE_COMPILED)
    modifier_hits = _match_all(text, _MODIFIER_COMPILED)

    if self_care_hits and not modifier_hits:
        return RuleClassification(
            tier_name="SELF_CARE",
            reasoning=SELF_CARE_REASONING,
            matches=[
                RuleMatch(
                    rule_id="self_limiting_complaint",
                    explanation="matched a recognised self-limiting complaint",
                    matched_terms=self_care_hits,
                )
            ],
            emergency=None,
            defaulted=False,
        )

    if self_care_hits and modifier_hits:
        # Recognised complaint, but something about it is not the ordinary case.
        return RuleClassification(
            tier_name="URGENT",
            reasoning=(
                "What you described is often minor, but you also mentioned "
                "something that makes this less ordinary, so it is worth "
                "having it looked at rather than waiting."
            ),
            matches=[
                RuleMatch(
                    rule_id="self_care_overridden_by_modifier",
                    explanation="a recognised minor complaint carried an escalating modifier",
                    matched_terms=modifier_hits,
                )
            ],
            emergency=None,
            defaulted=False,
        )

    # 4. Nothing recognised. Default up, never down.
    return RuleClassification(
        tier_name="URGENT",
        reasoning=DEFAULT_REASONING,
        matches=[],
        emergency=None,
        defaulted=True,
    )
