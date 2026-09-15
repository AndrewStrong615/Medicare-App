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

from app.core.emergency import (
    EmergencyGuidance,
    normalize_query,
    plural_tolerant,
    screen_for_emergency,
)


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
            # "over"/"more than" breaks a literal match on the phrases above
            # ("for over a week" does not contain "for a week"), so a
            # description that has plainly persisted was falling through
            # unrecognised. Same class of gap as the glued-list fix in
            # emergency.normalize_query: a natural insertion defeating a
            # literal phrase match.
            "for over a week", "for over two weeks", "for over a month",
            "for more than a week", "for more than two weeks",
            "for more than a month",
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
    # -----------------------------------------------------------------
    # Added 2026-09-14, authorised by the repository owner in conversation
    # after being shown the 252 failing descriptions this closes.
    #
    # ⛔ THESE LOWER A TIER. Every other change made in the same pass raises
    # one, and could be justified on the grounds that it can only make
    # screening more sensitive. This block cannot. Each word here is a
    # decision that a complaint is ordinarily minor, which is the
    # "SELF_CARE must be positively earned" rule CLAUDE.md calls the single
    # most important one in this module. They belong in the clinical
    # reviewer's read alongside the rest of the instrument.
    #
    # What made them worth adding: the list knew "a cold" but not "a head
    # cold" or "the sniffles", "sore throat" but not "my throat feels raw".
    # Someone with a head cold was told to get seen. An URGENT tier that
    # fires for the sniffles is one people stop reading.
    #
    # The escalating-modifier check still runs over all of these, so
    # "severe sunburn", "reflux for over a week" and "a blister that is
    # getting worse" are URGENT exactly as before — these words earn
    # SELF_CARE only in the unmodified case.
    "head cold", "the sniffles", "sniffles",
    "throat feels raw", "raw throat", "tickle in my throat",
    "lost my voice", "hoarse", "croaky",
    "dull headache", "headache from staring", "headache at the end of the day",
    "acid reflux", "reflux",
    "eczema", "dandruff", "itchy scalp", "flaky scalp",
    # ⛔ NOT bare "sunburn", for the same reason as "blister" below. A bare
    # pattern earned SELF_CARE for "sunburn with blisters and I feel faint",
    # which is a blistering burn with a systemic symptom. Caught by a probe
    # rather than by the corpus — worth recording, because it means the
    # corpus does not bound this risk and the qualifier is doing real work.
    "a bit of sunburn", "slight sunburn", "a little sunburn",
    "cracked lips", "dry lips",
    # ⛔ "blister" is deliberately NOT here bare. Shingles presents as
    # "a painful band of blisters", and a bare "blister" pattern would earn
    # that SELF_CARE — a false reassurance on a condition that needs
    # treatment within days. Only the unambiguous friction sites are listed.
    "small blister", "blister on my heel", "blister on my foot",
    "blister on my toe", "blister from new shoes",
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
    "for weeks", "for a week", "for several days", "for two weeks",
    "for a month", "for months",
    # Kept in sync with _URGENT_RULES' persistent_or_worsening phrases above:
    # this list previously lacked "for two weeks"/"for several days" (already
    # in the urgent list) and the "over"/"more than" variants of all of them,
    # so a recognised self-care phrase with a plainly-persistent duration
    # could still resolve to SELF_CARE if nothing else in this file happened
    # to catch it first.
    "for over a week", "for over two weeks", "for over a month",
    "for more than a week", "for more than two weeks", "for more than a month",
    "high fever", "can't sleep", "cant sleep",
    # Added 2026-09-14 from the 10,000-case common-illness corpus. A
    # description of an underactive thyroid — "exhausted and dry skin" —
    # earned SELF_CARE off the words "dry skin" while the word "exhausted"
    # sat beside it doing nothing. Profound fatigue alongside a minor
    # complaint is not the ordinary case the self-care list assumes, which is
    # the same argument that already puts "can't sleep" on this list.
    "exhausted", "exhaustion", "extreme tiredness", "wiped out",
    "no energy at all",
    # Faintness beside a minor complaint is not the ordinary case either.
    # Added in the same pass; escalating, so it can only raise a tier.
    "feel faint", "feeling faint", "about to pass out",
    "lightheaded", "light headed", "light-headed",
    "blisters",
    "pregnant", "my baby", "my newborn", "my infant",
    "immunocompromised", "chemotherapy", "transplant",
    "blood", "bleeding",
    "numb", "numbness", "weakness on one side",
    "confused", "confusion",
)


def _compile(phrase: str) -> re.Pattern[str]:
    """
    Compile an ESCALATING phrase — an urgent rule, or a self-care modifier.

    Plural-tolerant, for the reason set out in `emergency.plural_tolerant`:
    "a dog bite" was screened and "two dog bites" was not. Widening these two
    lists can only move a description UP a tier, so it carries the same
    one-directional safety property as the emergency lists.

    ⛔ `_SELF_CARE_PATTERNS` deliberately does NOT use this. Widening the
    self-care list is the one direction that lowers a tier, and CLAUDE.md is
    explicit that SELF_CARE must be positively earned. See
    `_compile_self_care`.
    """
    return re.compile(plural_tolerant(phrase), re.IGNORECASE)


# ---------------------------------------------------------------------------
# A self-care phrase that is really the first half of something else.
#
# Found by the 10,000-case common-illness corpus, and it is the worst kind of
# defect this module can have: a FALSE SELF_CARE, the one direction the whole
# safety architecture is built to make impossible.
#
# "a cold" is compiled with word boundaries, and the boundary after "cold" is
# satisfied by the space in "a cold sore". So every description of a cold sore
# matched the common-cold pattern, earned SELF_CARE, and was told it would
# settle on its own. Nothing else in the file could catch it: the match was
# positive, so the default never ran, and no escalating modifier was present.
#
# ⛔ The guard is a suffix exclusion, not a removal. Deleting "a cold" would
# break "I have a cold", which is how most people say it. This is deliberately
# the narrowest possible fix: it voids the match only where the next word
# turns the phrase into a different complaint.
# ---------------------------------------------------------------------------
_SELF_CARE_VOIDED_BY_SUFFIX: dict[str, tuple[str, ...]] = {
    "a cold": ("sore", "sores"),
}


def _compile_self_care(phrase: str) -> re.Pattern[str]:
    """
    Compile a self-care phrase: plural-tolerant, with suffix exclusions.

    Plural tolerance was authorised by the repository owner on 2026-09-14
    along with the vocabulary above. It is a matcher defect rather than a
    vocabulary judgement — "mosquito bite" was already a reviewed self-care
    phrase, and "a few mosquito bites" is the same complaint written the way
    people write it, yet only the singular matched. Same root cause as the
    red-flag plural miss in `emergency.plural_tolerant`, and found in the
    same run.

    ⛔ It is still the de-escalating direction, so unlike the escalating
    lists it cannot be justified as safe-by-construction. What keeps it
    bounded is that it admits only the plural of a phrase a reviewer already
    accepted, never a new phrase.
    """
    body = plural_tolerant(phrase)
    suffixes = _SELF_CARE_VOIDED_BY_SUFFIX.get(phrase)
    if suffixes:
        body += r"(?!\s+(?:" + "|".join(re.escape(s) for s in suffixes) + r")\b)"
    return re.compile(body, re.IGNORECASE)


_URGENT_COMPILED = [
    (rule_id, explanation, tuple((p, _compile(p)) for p in phrases))
    for rule_id, explanation, phrases in _URGENT_RULES
]
_SELF_CARE_COMPILED = tuple(
    (p, _compile_self_care(p)) for p in _SELF_CARE_PATTERNS
)
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
