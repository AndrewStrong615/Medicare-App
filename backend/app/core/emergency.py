"""
Emergency red-flag screening for symptom searches.

This module does NOT diagnose and does not decide how urgent a person's
situation is. It does one thing: recognise language associated with
well-established emergency warning signs and route the user to emergency
services instead of to reading material.

Design notes:

* Over-triggering is the safe direction. Showing emergency guidance to
  someone who did not need it costs them a few seconds; failing to show it to
  someone having a heart attack does not. Matching is therefore deliberately
  broad, and results are still shown underneath the guidance rather than
  suppressed.
* The wording points at emergency services and national crisis lines. It
  never tells the user what condition they have or what treatment to seek.
* Phrase lists are drawn from public emergency-warning-sign guidance (e.g.
  heart attack and stroke warning signs published by CDC/AHA, and the 988
  Suicide & Crisis Lifeline). They are signposting terms, not a clinical
  rule set, and should be reviewed by a clinician before release.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field


"""
Shown on every result, regardless of what was searched.

Deliberately general. Condition-specific criteria ("seek care if your fever
exceeds X") would be clinical content this app is not allowed to author; the
authoritative source's own guidance is rendered in the topic summary instead.
"""
GENERAL_CARE_GUIDANCE = (
    "If your symptoms are severe, getting worse, or you are worried about "
    "them, contact a healthcare professional. If you think this may be an "
    "emergency, call 911 or your local emergency number — do not wait."
)

RESULT_DISCLAIMER = (
    "This is general health information from the US National Library of "
    "Medicine. It is not medical advice, not a diagnosis, and not a "
    "substitute for talking to a healthcare professional about your own "
    "situation."
)


@dataclass(frozen=True)
class EmergencyGuidance:
    """What to show a user whose search matched an emergency red flag."""

    category: str
    headline: str
    action: str
    matched_terms: list[str] = field(default_factory=list)


# Each entry: category -> (headline, action, trigger phrases).
# Phrases are matched case-insensitively against the whole search string.
_EMERGENCY_RULES: list[tuple[str, str, str, tuple[str, ...]]] = [
    (
        "cardiac",
        "If you have chest pain, call 911 now.",
        "Chest pain can be a sign of a medical emergency. Call 911 (or your "
        "local emergency number) right away. Do not drive yourself to the "
        "hospital.",
        (
            "chest pain",
            "chest pressure",
            "chest tightness",
            "pain in my chest",
            "heart attack",
            "crushing chest",
            "pain radiating to arm",
            "left arm pain and chest",
        ),
    ),
    (
        "breathing",
        "If you are struggling to breathe, call 911 now.",
        "Difficulty breathing can be a medical emergency. Call 911 (or your "
        "local emergency number) right away.",
        (
            "can't breathe",
            "cant breathe",
            "cannot breathe",
            "difficulty breathing",
            "trouble breathing",
            "shortness of breath",
            "struggling to breathe",
            "choking",
            "gasping for air",
        ),
    ),
    (
        "stroke",
        "If you notice stroke warning signs, call 911 now.",
        "Sudden face drooping, arm weakness, or trouble speaking can be signs "
        "of a stroke. Call 911 (or your local emergency number) immediately — "
        "treatment is time-critical.",
        (
            "stroke",
            "face drooping",
            "slurred speech",
            "sudden numbness",
            "one side of my body",
            "sudden confusion",
            "sudden severe headache",
            "worst headache of my life",
        ),
    ),
    (
        "bleeding_trauma",
        "For severe bleeding or a serious injury, call 911 now.",
        "Heavy bleeding that will not stop, or a serious injury, needs "
        "emergency care. Call 911 (or your local emergency number).",
        (
            "severe bleeding",
            "bleeding won't stop",
            "bleeding wont stop",
            "uncontrolled bleeding",
            "coughing up blood",
            "vomiting blood",
            "head injury",
            "broken bone through skin",
        ),
    ),
    (
        "anaphylaxis",
        "For a severe allergic reaction, call 911 now.",
        "Swelling of the face, lips, tongue, or throat with trouble breathing "
        "can be a severe allergic reaction. Use an epinephrine auto-injector "
        "if you have one and call 911 (or your local emergency number).",
        (
            "anaphylaxis",
            "anaphylactic",
            "throat closing",
            "tongue swelling",
            "severe allergic reaction",
            "lips swelling",
        ),
    ),
    (
        "consciousness",
        "If someone is unresponsive or having a seizure, call 911 now.",
        "Loss of consciousness, an unresponsive person, or a first-time or "
        "prolonged seizure needs emergency care. Call 911 (or your local "
        "emergency number).",
        (
            "unconscious",
            "unresponsive",
            "passed out",
            "fainted and won't wake",
            "seizure",
            "convulsion",
            "not waking up",
        ),
    ),
    (
        "self_harm",
        "If you are thinking about harming yourself, help is available right now.",
        "You can reach the 988 Suicide & Crisis Lifeline by calling or texting "
        "988 in the US, 24 hours a day. If you are in immediate danger, call "
        "911 or your local emergency number. You deserve support from a real "
        "person, not an app.",
        (
            "suicide",
            "suicidal",
            "kill myself",
            "want to die",
            "end my life",
            "self harm",
            "self-harm",
            "hurt myself",
            "harm myself",
        ),
    ),
    (
        "overdose_poisoning",
        "For a suspected overdose or poisoning, get emergency help now.",
        "Call 911 (or your local emergency number). In the US you can also "
        "reach Poison Control at 1-800-222-1222, 24 hours a day.",
        (
            "overdose",
            "overdosed",
            "took too many pills",
            "poisoning",
            "swallowed poison",
            "drank bleach",
        ),
    ),
]


def _compile(phrase: str) -> re.Pattern[str]:
    # Word boundaries stop "stroke" matching inside "strokes of luck" style
    # words while still allowing normal plurals and surrounding punctuation.
    return re.compile(rf"(?<!\w){re.escape(phrase)}(?!\w)", re.IGNORECASE)


_COMPILED: list[tuple[str, str, str, tuple[re.Pattern[str], ...], tuple[str, ...]]] = [
    (category, headline, action, tuple(_compile(p) for p in phrases), phrases)
    for category, headline, action, phrases in _EMERGENCY_RULES
]


def screen_for_emergency(query: str) -> EmergencyGuidance | None:
    """
    Return guidance if `query` contains emergency red-flag language.

    Returns the first matching category so the user sees one clear
    instruction rather than a wall of competing warnings.
    """
    if not query or not query.strip():
        return None

    for category, headline, action, patterns, phrases in _COMPILED:
        matched = [
            phrase for pattern, phrase in zip(patterns, phrases) if pattern.search(query)
        ]
        if matched:
            return EmergencyGuidance(
                category=category,
                headline=headline,
                action=action,
                matched_terms=matched,
            )

    return None
