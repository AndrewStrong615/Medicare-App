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

from app.core import symptom_concepts


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
        "local emergency number) right away.",
        (
            "chest pain",
            "chest pressure",
            "chest tightness",
            "chest feels tight",
            "chest is tight",
            "pain in my chest",
            "heart attack",
            "crushing chest",
            "pain radiating to arm",
            "left arm pain and chest",
            # Added 2026-09-14 from the 10,000-case common-illness corpus.
            # "chest pressure" is the clinical word order; nobody types it.
            # "crushing pressure in my chest" and "heavy pressure on my
            # chest" both matched NOTHING and fell to the URGENT default.
            # The first of these is one of the four under-triaged
            # presentations CLAUDE.md reported and left unfixed.
            "pressure in my chest",
            "pressure on my chest",
            "tightness in my chest",
            "chest feels heavy",
            "heaviness in my chest",
            "weight on my chest",
            "squeezing in my chest",
            # The list had "chest is tight" and "chest feels tight" but not
            # "chest gets tight" — an inflection of the same three words,
            # and the ordinary way to describe exertional tightness.
            "chest gets tight",
            "chest goes tight",
            "chest tightens",
            "tight chest",
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
            "hard time breathing",
            "can't catch my breath",
            "cant catch my breath",
            "shortness of breath",
            "struggling to breathe",
            "choking",
            "gasping for air",
            # Added 2026-09-14 from the 10,000-case common-illness corpus.
            # "shortness of breath" is the noun form a clinician writes. Every
            # lay phrasing of the same thing — "I am short of breath", "I feel
            # breathless" — matched nothing, so heart failure, pneumonia and
            # an asthma flare described in ordinary words all fell to URGENT.
            #
            # ⛔ Deliberately NOT added: the bare phrase "out of breath".
            # It is what everyone says after climbing stairs, and a red flag
            # that fires for every gym-goer is a red flag people learn to
            # ignore. Recognising "out of breath walking to the mailbox" —
            # breathlessness on minimal exertion — needs the exertion and the
            # breathlessness read together, which is a combinator and a
            # clinician's call, not a phrase.
            "short of breath",
            "breathless",
            "breathlessness",
            "can't get enough air",
            "cant get enough air",
            "struggling for breath",
            "fighting for breath",
            "winded just",
            # Breathlessness on MINIMAL exertion, which is the part that
            # distinguishes it from being out of breath after a run. Naming
            # the trivial activity is what makes these safe to match where
            # the bare phrase is not.
            "out of breath just",
            "out of breath walking",
            "out of breath doing nothing",
            "out of breath getting dressed",
            "out of breath talking",
            "breathless walking",
            "breathless lying flat",
            "breathless doing nothing",
        ),
    ),
    (
        "stroke",
        "If you notice stroke warning signs, call 911 now.",
        "Sudden face drooping, arm weakness, or trouble speaking can be signs "
        "of a stroke. Call 911 (or your local emergency number) right away.",
        (
            "stroke",
            # Both word orders. People write "my face is drooping", not the
            # clinical "face drooping" — matching only the latter missed a
            # textbook stroke description written in natural language.
            "face drooping",
            "face is drooping",
            "face started drooping",
            "one side of my face",
            "slurred speech",
            "speech is slurred",
            "slurring my words",
            "slurring my speech",
            "can't get my words out",
            "cant get my words out",
            "arm is weak",
            "arm feels weak",
            "arm went weak",
            "sudden numbness",
            "one side of my body",
            "one side is weak",
            "weak on one side",
            "sudden confusion",
            "sudden severe headache",
            "worst headache of my life",
            # Added 2026-09-14 from the 10,000-case common-illness corpus.
            # The list had the face and the arm but not the mouth or the eye,
            # so "I can't close one eye and my mouth droops" — a textbook
            # description of a facial droop — matched nothing.
            "mouth droops",
            "mouth is drooping",
            "mouth has dropped",
            "can't close one eye",
            "cant close one eye",
            "my face has dropped",
            "face has dropped",
            "numbness down one side",
            "weak down one side",
            "weakness on my right side",
            "weakness on my left side",
            "went weak for a few minutes",
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
            # Added 2026-09-14 from the 10,000-case common-illness corpus.
            # "head injury" is how a form field is labelled; "I hit my head"
            # is how a person says it. The gap is one of the four
            # under-triaged presentations CLAUDE.md reported and left
            # unfixed. Likewise "vomiting blood" against "I threw up blood".
            "hit my head",
            "banged my head",
            "knocked my head",
            "hit his head",
            "hit her head",
            "threw up blood",
            "throwing up blood",
            "vomited blood",
            "blood in my vomit",
            "black tarry stools",
            "bleeding heavily",
            "losing a lot of blood",
        ),
    ),
    (
        "anaphylaxis",
        "For a severe allergic reaction, call 911 now.",
        # Deliberately routing-only. An earlier draft told the user to use an
        # epinephrine auto-injector; instructing someone to administer a drug
        # is treatment advice this app is not permitted to give.
        "Swelling of the face, lips, tongue, or throat with trouble breathing "
        "can be a medical emergency. Call 911 (or your local emergency "
        "number) right away.",
        (
            "anaphylaxis",
            "anaphylactic",
            "throat closing",
            "throat is closing",
            "tongue swelling",
            "tongue is swelling",
            "severe allergic reaction",
            "lips swelling",
            "lips are swelling",
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
            # Added 2026-09-14 from the 10,000-case common-illness corpus.
            # "passed out" was here bare, but "fainted" only in the compound
            # "fainted and won't wake" — so "I fainted and hit the floor"
            # matched nothing, while the same event in the other synonym
            # matched immediately. Two words for one thing, screened
            # differently. Loss of consciousness is a category this app
            # already defines; these are its lay names.
            "fainted",
            "fainting",
            "blacked out",
            "keeled over",
            "collapsed",
            "lost consciousness",
            "went limp",
            "would not wake up",
            "wouldn't wake up",
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
            # Added 2026-09-14 from the 10,000-case common-illness corpus.
            # "hurt myself" does not match "hurting myself" — a bare
            # inflection defeating a red flag, and one of the four
            # under-triaged presentations CLAUDE.md reported and left
            # unfixed. This is the category where over-inclusion is most
            # clearly right: the copy routes to 988 and offers a person.
            "hurting myself",
            "harming myself",
            "cutting myself",
            "cut myself on purpose",
            "don't want to be here",
            "dont want to be here",
            "don't want to be alive",
            "dont want to be alive",
            "better off without me",
            "ending my life",
            "take my own life",
        ),
    ),
    (
        # Added after compliance review flagged these as gaps. Like every
        # entry here, the copy is pure routing — it names no condition and
        # gives no treatment. Still pending clinician review (see CLAUDE.md).
        "vision_loss",
        "For sudden vision loss, get emergency care now.",
        "Sudden loss of vision, or sudden double vision, needs urgent "
        "assessment. Call 911 (or your local emergency number), or go to an "
        "emergency department.",
        (
            "sudden vision loss",
            "suddenly lost vision",
            "lost vision in",
            "lost my vision",
            "can't see",
            "cant see",
            "sudden blindness",
            "sudden double vision",
            "curtain over my eye",
            # Added 2026-09-14 from the 10,000-case common-illness corpus.
            # "curtain over my eye" does not match "a curtain came over my
            # eye" — the verb in the middle defeats the literal. The fourth
            # of the under-triaged presentations CLAUDE.md reported.
            "curtain came over my eye",
            "curtain coming over my eye",
            "curtain came down over my eye",
            "curtain across my vision",
            "shadow over my vision",
            "part of my vision is gone",
            "part of my vision has gone",
            "lost part of my vision",
            "flashes and floaters",
        ),
    ),
    (
        # The contiguous-phrase limit that used to be recorded here is FIXED:
        # "my neck is stiff and I have a fever" — the two concepts named
        # separately, in that order — is now recognised by the concept
        # combinator in `app.core.symptom_concepts`, consulted at the end of
        # `screen_for_emergency`. All three combinations it knows are read out
        # of this rule's own action text below; nothing new is claimed.
        #
        # The phrases here are unchanged and are still tried first, so a
        # description that matched before matches identically now.
        "sepsis_meningitis",
        "These symptoms need emergency care now.",
        "A stiff neck with fever, a rash that does not fade when pressed, or "
        "confusion with a high fever needs emergency assessment. Call 911 (or "
        "your local emergency number).",
        (
            "stiff neck and fever",
            "stiff neck with a fever",
            "stiff neck and a fever",
            "rash that doesn't fade",
            "rash that does not fade",
            "non-blanching rash",
            "meningitis",
            "sepsis",
        ),
    ),
    (
        "infant_fever",
        "For a fever in a baby, get medical help now.",
        "A fever in a newborn or young infant needs urgent medical "
        "assessment. Call 911 (or your local emergency number), or contact "
        "your doctor immediately.",
        (
            "newborn fever",
            "fever in a newborn",
            "baby has a fever",
            "infant fever",
            "fever in an infant",
            # Added 2026-09-14 from the 10,000-case common-illness corpus.
            # A parent does not write "infant fever" into a box at 3am. They
            # write that the baby feels hot. Without these the description
            # fell to the infant_or_young_child URGENT rule, which is a tier
            # below what this app's own copy says a fever in a newborn needs.
            "newborn feels hot",
            "baby feels hot",
            "baby is burning up",
            "newborn is burning up",
            "baby is really hot",
            "baby has a temperature",
            "newborn has a temperature",
            "baby is running a fever",
        ),
    ),
    (
        "pregnancy",
        "These pregnancy symptoms need emergency care now.",
        "Bleeding or severe abdominal pain during pregnancy needs urgent "
        "assessment. Call 911 (or your local emergency number), or contact "
        "your maternity unit immediately.",
        (
            "bleeding while pregnant",
            "bleeding during pregnancy",
            "severe abdominal pain pregnant",
            "pregnant and bleeding",
            "pregnant and severe pain",
            # Added 2026-09-14 from the 10,000-case common-illness corpus.
            # Word order again: "pregnant and bleeding" is here, but "I am
            # bleeding and I am pregnant" — the same two facts, stated the
            # other way round — matched nothing and fell to the
            # pregnancy_related URGENT rule. Same root cause as the stroke
            # "my face is drooping" fix already recorded in CLAUDE.md.
            "bleeding and i am pregnant",
            "bleeding and i'm pregnant",
            "pregnant and i am bleeding",
            "pregnant and i'm bleeding",
            "spotting while pregnant",
            "cramping while pregnant",
            "spotting and cramping while pregnant",
            "pregnant with severe abdominal pain",
            "severe pain and i am pregnant",
            "severe abdominal pain and i am pregnant",
            "severe one-sided pain and i am pregnant",
            # Conjunction-free forms. A pasted list arrives as "Pregnant"
            # followed by "Bleeding" with the separator lost, which
            # normalize_query splits back into "pregnant Bleeding" — two
            # adjacent words and no "and" between them for a literal to hook
            # on. Exactly the real-submission shape that produced the
            # normalize_query fix recorded in CLAUDE.md.
            "pregnant bleeding",
            "bleeding pregnant",
            "bleeding i am pregnant",
            "bleeding i'm pregnant",
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


def normalize_query(query: str) -> str:
    """
    Fold typographic variants so screening is not defeated by a keyboard.

    iOS substitutes a curly apostrophe (U+2019) as you type, so a user who
    types "can't breathe" actually sends "can’t breathe". Matching the ASCII
    form literally would miss it — on the app's primary target platform.

    It also separates run-together list items. People paste symptom lists, and
    the separators do not always survive the clipboard: "Chest pain" followed
    by "Shortness of breath" arrives as "Chest painShortness of breath". Every
    phrase here is compiled with word boundaries, so that glued form matched
    NOTHING — not the cardiac terms, not the breathing terms — and a
    description that should have returned "call 911" was instead unrecognised
    and fell to the URGENT default. Found from a real submission, where a
    pasted list of cold symptoms arrived as "Runny or stuffy noseScratchy or
    sore throatMild cough" and matched none of the three self-care phrases it
    plainly contained.

    The split is safe in one direction on purpose: it only ever inserts a
    space, so it can make screening more sensitive and can never make it less.
    Ordinary prose has no lowercase-to-uppercase boundary inside a word, so
    nothing a person types normally is affected.

    KNOWN LIMIT: this catches the sentence-case lists that people actually
    paste. A list glued together in all capitals ("CHEST PAINSHORTNESS") has
    no case boundary to split on and is still missed.
    """
    folded = query.replace("’", "'").replace("‘", "'")
    folded = folded.replace("ʼ", "'")
    # "painShortness" -> "pain Shortness", before any matching happens.
    folded = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", folded)
    # Collapse runs of whitespace so "chest   pain" still matches.
    return re.sub(r"\s+", " ", folded)


def plural_tolerant(phrase: str) -> str:
    """
    The body of a red-flag pattern, allowing the phrase's ordinary plural.

    ⛔ THIS FIXED A REAL AND SERIOUS MISS, found 2026-09-14 by the
    10,000-case common-illness corpus. Every phrase here used to be compiled
    as `(?<!\\w)phrase(?!\\w)`, and a trailing plural "s" is a word character,
    so the closing guard failed on it. The consequence, verified before the
    fix:

        "I have chest pain"          -> cardiac        (911 guidance)
        "I am getting chest pains"   -> NOTHING        (URGENT default)

        "she had a seizure"          -> consciousness
        "she had seizures"           -> NOTHING

        "I had a head injury"        -> bleeding_trauma
        "I have had head injuries"   -> NOTHING

        "a stroke" / "two strokes", "an overdose" / "overdoses": same.

    A plural is not an unusual way to write any of these. "Chest pains" is
    arguably the *more* natural phrasing, and it received no emergency
    guidance at all.

    The old docstring on this function asserted the opposite — that word
    boundaries allow "normal plurals". That claim was simply untrue, and
    being written down is probably why nobody checked it.

    Two inflections are allowed, and only at the very end of the phrase:

        pain -> pains, overdose -> overdoses   ("s" / "es")
        injury -> injuries                     (trailing "y" -> "ies")

    ⛔ It can only ever make screening MORE sensitive. It adds optional
    trailing characters to a pattern that already had to match in full; it
    can turn a non-match into a match and can never do the reverse. That is
    the same one-directional argument `normalize_query`'s case-split rests
    on, and it is what makes this safe to change without re-reviewing every
    phrase in the file.
    """
    escaped = re.escape(phrase)
    if phrase.endswith("y") and len(phrase) > 1 and phrase[-2] not in "aeiou":
        escaped = re.escape(phrase[:-1]) + "(?:y|ies)"
        return rf"(?<!\w){escaped}(?!\w)"
    return rf"(?<!\w){escaped}(?:es|s)?(?!\w)"


# ---------------------------------------------------------------------------
# ⛔ THE ONLY NARROWING IN THIS FILE. Read before adding to it.
#
# Every other change ever made to these lists has been additive, and the
# safety argument for all of them was that they can only make screening more
# sensitive. This one goes the other way, so it carries a different burden.
#
# A trigger phrase here is voided when one of the listed words comes
# immediately before it. There is exactly one entry:
#
#     "poisoning", when preceded by "food"
#
# WHY: the overdose_poisoning category is about a toxin — swallowed poison,
# too many pills, bleach — and its copy routes to 911 and Poison Control.
# "Food poisoning" is not that. It is what people call gastroenteritis, and
# the word "poisoning" inside it is a collision, not a red flag. Before this,
# "I have food poisoning, cramps and diarrhea" returned an instruction to
# call Poison Control.
#
# The repository owner authorised this in conversation on 2026-09-14, and the
# reasoning is theirs: a person typing "food poisoning" is handing the app a
# self-assigned LABEL, and the app's job is to read what they actually
# describe and judge severity from that. Letting the label short-circuit to an
# emergency category does the opposite — it triages the word rather than the
# person. With the exclusion in place, "food poisoning, cramps and diarrhea"
# is judged on the cramps and the diarrhea, and "can't keep fluids down"
# still reaches URGENT on its own merits.
#
# ⛔ WHAT THIS DOES NOT TOUCH: "poisoning" alone, "swallowed poison",
# "overdose", "overdosed", "took too many pills", "drank bleach" — every one
# still fires exactly as before. A test asserts it. Do not add an entry here
# to quieten a false positive without the same explicit approval; the
# one-directional safety property is the reason the rest of this file can be
# extended without re-reviewing all of it.
# ---------------------------------------------------------------------------
_VOIDED_BY_PREFIX: dict[str, tuple[str, ...]] = {
    "poisoning": ("food",),
}


def _compile(phrase: str) -> re.Pattern[str]:
    # Word boundaries stop "stroke" matching inside "strokes of luck" style
    # words. `plural_tolerant` then re-admits the plural the boundary would
    # otherwise exclude — see its docstring for why that was load-bearing.
    body = plural_tolerant(phrase)
    prefixes = _VOIDED_BY_PREFIX.get(phrase)
    if prefixes:
        guard = "".join(rf"(?<!{re.escape(p)} )" for p in prefixes)
        body = guard + body
    return re.compile(body, re.IGNORECASE)


_COMPILED: list[tuple[str, str, str, tuple[re.Pattern[str], ...], tuple[str, ...]]] = [
    (category, headline, action, tuple(_compile(p) for p in phrases), phrases)
    for category, headline, action, phrases in _EMERGENCY_RULES
]

# The reviewed copy, by category. A concept combination resolves to a category
# id and reads its wording from here, so there is exactly one copy of every
# emergency instruction and a combinator cannot introduce a second.
_COPY_BY_CATEGORY: dict[str, tuple[str, str]] = {
    category: (headline, action)
    for category, headline, action, _ in _EMERGENCY_RULES
}


def screen_for_emergency(query: str) -> EmergencyGuidance | None:
    """
    Return guidance if `query` contains emergency red-flag language.

    Returns the first matching category so the user sees one clear
    instruction rather than a wall of competing warnings.

    Two passes, in this order and for this reason:

    1. Every literal phrase in `_EMERGENCY_RULES`, exactly as before.
    2. Only if none of them matched, the concept combinations in
       `app.core.symptom_concepts` — which catch the red flags this file's
       own copy names but a contiguous phrase cannot express, such as a stiff
       neck and a fever written as two separate clauses.

    Putting the literals first is what makes the second pass safe: anything
    that matched before this existed matches identically now, in the same
    category, with the same wording. The combinator can only turn a `None`
    into guidance, never one category into another.
    """
    if not query or not query.strip():
        return None

    normalized = normalize_query(query)

    for category, headline, action, patterns, phrases in _COMPILED:
        matched = [
            phrase
            for pattern, phrase in zip(patterns, phrases)
            if pattern.search(normalized)
        ]
        if matched:
            return EmergencyGuidance(
                category=category,
                headline=headline,
                action=action,
                matched_terms=matched,
            )

    combination = symptom_concepts.screen_combinations(normalized)
    if combination:
        headline, action = _COPY_BY_CATEGORY[combination.category]
        return EmergencyGuidance(
            category=combination.category,
            headline=headline,
            action=action,
            matched_terms=list(combination.matched_terms),
        )

    return None
