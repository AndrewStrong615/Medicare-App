"""
Synthetic corpus for measuring symptom-intake triage, with gold urgency tiers.

SYNTHETIC ONLY. Every description here was written by an engineer against no
real person. CLAUDE.md forbids real symptom data anywhere in this repository,
and that applies with more force here than anywhere else in it: this file is
nothing but symptom descriptions.

## ⛔ What a gold label here is, and what it is not

`gold` is **the tier this app's own documented intent says it should return**,
not a clinical judgement about a real presentation. Each case records `basis`
so a reviewer can see where its label came from:

* `screening intent: X`   — emergency.py defines category X and this
                            description is a lay phrasing of it.
* `urgent rule: X`        — rules_triage.py defines urgent rule X and this
                            description is a lay phrasing of it.
* `self-care list`        — a recognised self-limiting complaint with no
                            escalating modifier.
* `safe default`          — nothing is recognised, so URGENT is correct *by
                            design*: "not recognised is not the same as
                            harmless".
* `documented gap`        — CLAUDE.md records this as currently missed. These
                            are expected to fail until the gap is closed, and
                            are the cases a fix has to move.

So a score from this corpus measures **consistency with documented intent and
regression against it**. It is NOT a validation of the instrument, and a
number from it must never be described as clinical accuracy. The labels were
assigned by a software engineer; a clinician has reviewed neither them nor the
tier definitions they encode. That review is the release blocker recorded in
CLAUDE.md and this file does not touch it.

What the corpus IS good for: telling you whether a change to the phrase lists
or the matcher made screening more sensitive, less sensitive, or neither —
which is a question nobody could previously answer without reading the diff
and reasoning about it.

## `natural`

True when the description is phrased the way a person would actually write
it, rather than containing a phrase copied out of the lists. Matching your own
phrase list is trivially easy; the accuracy that matters is on paraphrases, so
`measure.py` reports the two separately. Treat the natural-phrasing number as
the real one.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Case:
    description: str
    gold: str  # "EMERGENT" | "URGENT" | "SELF_CARE"
    basis: str
    natural: bool = True


# ---------------------------------------------------------------------------
# EMERGENT — every category emergency.py defines, in lay phrasings.
# ---------------------------------------------------------------------------

_EMERGENT: list[Case] = [
    # cardiac
    Case("chest pain", "EMERGENT", "screening intent: cardiac", natural=False),
    Case("I have really bad chest pain and it goes into my left arm", "EMERGENT", "screening intent: cardiac"),
    Case("my chest feels tight and I feel sick", "EMERGENT", "screening intent: cardiac"),
    Case("crushing pressure in my chest", "EMERGENT", "screening intent: cardiac"),
    Case("I think I might be having a heart attack", "EMERGENT", "screening intent: cardiac"),
    # breathing
    Case("difficulty breathing", "EMERGENT", "screening intent: breathing", natural=False),
    Case("I am having a hard time breathing", "EMERGENT", "screening intent: breathing"),
    Case("I can't catch my breath just walking to the kitchen", "EMERGENT", "screening intent: breathing"),
    Case("gasping for air", "EMERGENT", "screening intent: breathing"),
    # stroke
    Case("face drooping and slurred speech", "EMERGENT", "screening intent: stroke", natural=False),
    Case("my face is drooping on one side", "EMERGENT", "screening intent: stroke"),
    Case("I am slurring my words and my arm feels weak", "EMERGENT", "screening intent: stroke"),
    Case("this is the worst headache of my life, it came on out of nowhere", "EMERGENT", "screening intent: stroke"),
    Case("sudden numbness down one side of my body", "EMERGENT", "screening intent: stroke"),
    # bleeding / trauma
    Case("severe bleeding", "EMERGENT", "screening intent: bleeding_trauma", natural=False),
    Case("the bleeding won't stop no matter what I do", "EMERGENT", "screening intent: bleeding_trauma"),
    Case("I am coughing up blood", "EMERGENT", "screening intent: bleeding_trauma"),
    Case("I hit my head hard and feel awful", "EMERGENT", "screening intent: bleeding_trauma"),
    # anaphylaxis
    Case("severe allergic reaction", "EMERGENT", "screening intent: anaphylaxis", natural=False),
    Case("my throat is closing and my tongue is swelling", "EMERGENT", "screening intent: anaphylaxis"),
    Case("my lips are swelling up after eating a peanut", "EMERGENT", "screening intent: anaphylaxis"),
    # consciousness
    Case("unresponsive", "EMERGENT", "screening intent: consciousness", natural=False),
    Case("my husband passed out and I can't wake him", "EMERGENT", "screening intent: consciousness"),
    Case("she had a seizure", "EMERGENT", "screening intent: consciousness"),
    # self harm
    Case("I am having thoughts of suicide", "EMERGENT", "screening intent: self_harm"),
    Case("I want to die", "EMERGENT", "screening intent: self_harm", natural=False),
    Case("I have been thinking about hurting myself", "EMERGENT", "screening intent: self_harm"),
    # vision loss
    Case("I suddenly lost vision in my left eye", "EMERGENT", "screening intent: vision_loss"),
    Case("it is like a curtain came over my eye", "EMERGENT", "screening intent: vision_loss"),
    Case("sudden double vision", "EMERGENT", "screening intent: vision_loss", natural=False),
    # sepsis / meningitis — the concept-combinator cases
    Case("stiff neck and fever", "EMERGENT", "screening intent: sepsis_meningitis", natural=False),
    Case("my neck is stiff and I have a fever", "EMERGENT", "screening intent: sepsis_meningitis"),
    Case("I have a fever and my neck has gone stiff", "EMERGENT", "screening intent: sepsis_meningitis"),
    Case("burning up and I can't turn my neck", "EMERGENT", "screening intent: sepsis_meningitis"),
    Case("I have a rash and it doesn't fade when I press it", "EMERGENT", "screening intent: sepsis_meningitis"),
    Case("purple spots that dont fade", "EMERGENT", "screening intent: sepsis_meningitis"),
    Case("he is confused and has a really high temperature", "EMERGENT", "screening intent: sepsis_meningitis"),
    # infant fever
    Case("my baby has a fever", "EMERGENT", "screening intent: infant_fever", natural=False),
    Case("fever in a newborn", "EMERGENT", "screening intent: infant_fever", natural=False),
    # pregnancy
    Case("I am bleeding while pregnant", "EMERGENT", "screening intent: pregnancy"),
    Case("pregnant and bleeding", "EMERGENT", "screening intent: pregnancy", natural=False),
    # overdose / poisoning
    Case("I took too many pills", "EMERGENT", "screening intent: overdose_poisoning"),
    Case("my son swallowed poison", "EMERGENT", "screening intent: overdose_poisoning"),
]


# ---------------------------------------------------------------------------
# URGENT — the rules_triage urgent rules, in lay phrasings.
# ---------------------------------------------------------------------------

_URGENT: list[Case] = [
    # possible_fracture
    Case("I think I broke my wrist falling off my bike", "URGENT", "urgent rule: possible_fracture"),
    Case("my ankle is swollen and I can't put weight on it", "URGENT", "urgent rule: possible_fracture"),
    Case("I can't walk on my foot since I twisted it", "URGENT", "urgent rule: possible_fracture"),
    # wound_needs_review
    Case("a deep cut on my hand that might need stitches", "URGENT", "urgent rule: wound_needs_review"),
    Case("I got bitten by a dog", "URGENT", "urgent rule: wound_needs_review"),
    Case("puncture wound from a nail", "URGENT", "urgent rule: wound_needs_review", natural=False),
    # infection_signs
    Case("there is pus coming out of the cut and the skin around it is hot", "URGENT", "urgent rule: infection_signs"),
    Case("spreading redness up my leg from a scratch", "URGENT", "urgent rule: infection_signs"),
    Case("I have a boil that is getting more swollen", "URGENT", "urgent rule: infection_signs"),
    # persistent_or_worsening
    Case("a sore throat for a week", "URGENT", "urgent rule: persistent_or_worsening"),
    Case("sore throat for over a week", "URGENT", "urgent rule: persistent_or_worsening"),
    Case("a cough that won't go away", "URGENT", "urgent rule: persistent_or_worsening"),
    Case("my stomach ache keeps getting worse", "URGENT", "urgent rule: persistent_or_worsening"),
    Case("headaches for several days and not getting better", "URGENT", "urgent rule: persistent_or_worsening"),
    # fever_with_duration
    Case("a high fever", "URGENT", "urgent rule: fever_with_duration", natural=False),
    Case("I have had a fever for days", "URGENT", "urgent rule: fever_with_duration"),
    Case("my fever won't break", "URGENT", "urgent rule: fever_with_duration"),
    # cannot_keep_fluids_down
    Case("I can't keep anything down", "URGENT", "urgent rule: cannot_keep_fluids_down"),
    Case("throwing up everything I drink", "URGENT", "urgent rule: cannot_keep_fluids_down"),
    Case("I feel dehydrated and haven't been able to drink", "URGENT", "urgent rule: cannot_keep_fluids_down"),
    # eye_symptoms
    Case("my eye is red and painful", "URGENT", "urgent rule: eye_symptoms"),
    Case("I got a chemical in my eye", "URGENT", "urgent rule: eye_symptoms"),
    Case("light hurts my eyes", "URGENT", "urgent rule: eye_symptoms", natural=False),
    # new_lump_or_unexplained_change
    Case("I found a lump in my armpit", "URGENT", "urgent rule: new_lump_or_unexplained_change"),
    Case("a mole has changed shape", "URGENT", "urgent rule: new_lump_or_unexplained_change"),
    Case("losing weight without trying and night sweats", "URGENT", "urgent rule: new_lump_or_unexplained_change"),
    # medication_reaction
    Case("I think I am having a reaction to my medication", "URGENT", "urgent rule: medication_reaction"),
    Case("a new rash after taking the antibiotics", "URGENT", "urgent rule: medication_reaction"),
    Case("I have felt awful since starting the medication", "URGENT", "urgent rule: medication_reaction"),
    # pregnancy_related
    Case("I am 20 weeks pregnant and my ankles are swollen", "URGENT", "urgent rule: pregnancy_related"),
    Case("heartburn and I am pregnant", "URGENT", "urgent rule: pregnancy_related"),
    # infant_or_young_child
    Case("my toddler has been pulling at his ear", "URGENT", "urgent rule: infant_or_young_child"),
    Case("my baby is not feeding properly", "URGENT", "urgent rule: infant_or_young_child"),
    Case("she is 6 months old and has a rash", "URGENT", "urgent rule: infant_or_young_child"),
    # severe_pain
    Case("severe pain in my lower back", "URGENT", "urgent rule: severe_pain", natural=False),
    Case("the worst pain I have ever had in my stomach", "URGENT", "urgent rule: severe_pain"),
    Case("excruciating pain in my tooth", "URGENT", "urgent rule: severe_pain"),
    Case("10/10 pain and I can't sleep from the pain", "URGENT", "urgent rule: severe_pain"),
]


# ---------------------------------------------------------------------------
# URGENT by the safe default — nothing recognised, so URGENT is CORRECT.
#
# These are the cases that make the coverage number mean something. A high
# default rate is not an error rate; it is the app declining to say "fine"
# about something it does not recognise. But it is also the ceiling on how
# often SELF_CARE can ever be earned, which is the argument for licensed
# protocol content (CLAUDE.md: "Option 2").
# ---------------------------------------------------------------------------

_DEFAULTED: list[Case] = [
    Case("my left knee has been clicking when I go up stairs", "URGENT", "safe default"),
    Case("I feel a bit off today", "URGENT", "safe default"),
    Case("there is a strange taste in my mouth", "URGENT", "safe default"),
    Case("my fingers go white in the cold", "URGENT", "safe default"),
    Case("I keep waking up at 4am", "URGENT", "safe default"),
    Case("my ears feel full after the flight", "URGENT", "safe default"),
    Case("pins and needles in my foot when I sit cross legged", "URGENT", "safe default"),
    Case("I have been burping a lot", "URGENT", "safe default"),
    Case("my nails have ridges", "URGENT", "safe default"),
    Case("one of my eyelids keeps twitching", "URGENT", "safe default"),
    Case("I get a stitch in my side when I run", "URGENT", "safe default"),
    Case("my scalp is itchy", "URGENT", "safe default"),
    Case("I feel cold all the time", "URGENT", "safe default"),
    Case("my joints are stiff in the morning", "URGENT", "safe default"),
    Case("food tastes different since last week", "URGENT", "safe default"),
]


# ---------------------------------------------------------------------------
# SELF_CARE — recognised self-limiting complaints, no escalating modifier.
#
# Careful when adding: any of _ESCALATING_MODIFIERS present makes the correct
# answer URGENT, not SELF_CARE. "a sore throat for a week" belongs above.
# ---------------------------------------------------------------------------

_SELF_CARE: list[Case] = [
    Case("a sore throat", "SELF_CARE", "self-care list", natural=False),
    Case("I have a scratchy throat this morning", "SELF_CARE", "self-care list"),
    Case("runny nose and sneezing", "SELF_CARE", "self-care list"),
    Case("I have a stuffy nose", "SELF_CARE", "self-care list"),
    Case("I think I am coming down with a cold", "SELF_CARE", "self-care list"),
    Case("a mild headache", "SELF_CARE", "self-care list", natural=False),
    Case("a bit of a tension headache", "SELF_CARE", "self-care list"),
    Case("a tickly cough", "SELF_CARE", "self-care list"),
    Case("I have a dry cough", "SELF_CARE", "self-care list"),
    Case("a paper cut on my finger", "SELF_CARE", "self-care list"),
    Case("I got a small cut chopping vegetables", "SELF_CARE", "self-care list"),
    Case("I scraped my knee", "SELF_CARE", "self-care list"),
    Case("a minor burn from the oven", "SELF_CARE", "self-care list"),
    Case("I have a bruise on my shin", "SELF_CARE", "self-care list"),
    Case("mild heartburn after dinner", "SELF_CARE", "self-care list"),
    Case("indigestion", "SELF_CARE", "self-care list", natural=False),
    Case("hiccups", "SELF_CARE", "self-care list", natural=False),
    Case("an insect bite on my arm", "SELF_CARE", "self-care list"),
    Case("a mosquito bite that is itchy", "SELF_CARE", "self-care list"),
    Case("I have a hangover", "SELF_CARE", "self-care list"),
    Case("sore muscles after exercise", "SELF_CARE", "self-care list"),
    Case("my legs are aching after exercise", "SELF_CARE", "self-care list"),
    Case("mild sunburn on my shoulders", "SELF_CARE", "self-care list"),
    Case("dry skin on my hands", "SELF_CARE", "self-care list"),
    Case("chapped lips", "SELF_CARE", "self-care list", natural=False),
    Case("mild nausea this morning", "SELF_CARE", "self-care list"),
]


# ---------------------------------------------------------------------------
# Documented gaps. CLAUDE.md records each of these as a known miss.
#
# These are expected to FAIL until the gap named in `basis` is closed, and
# they are the whole point of the harness: a fix is a case moving from this
# section's failure list into the passing set, measured rather than argued.
# ---------------------------------------------------------------------------

_DOCUMENTED_GAPS: list[Case] = [
    # CLAUDE.md, "Glued list items ... KNOWN LIMIT": an all-caps pasted list
    # has no lowercase-to-uppercase boundary for normalize_query to split on.
    Case(
        "CHEST PAINSHORTNESS OF BREATH",
        "EMERGENT",
        "documented gap: all-caps glued list has no case boundary to split",
    ),
    Case(
        "RUNNY NOSESORE THROATMILD COUGH",
        "SELF_CARE",
        "documented gap: all-caps glued list has no case boundary to split",
    ),
    # CLAUDE.md, sepsis_meningitis: a two-term combinator was needed. FIXED by
    # app.core.symptom_concepts — kept here so a regression is visible.
    Case(
        "my neck is stiff and I have a fever",
        "EMERGENT",
        "documented gap (FIXED by symptom_concepts): two-term combinator",
    ),
]


CASES: list[Case] = (
    _EMERGENT + _URGENT + _DEFAULTED + _SELF_CARE + _DOCUMENTED_GAPS
)


TIERS: tuple[str, ...] = ("SELF_CARE", "URGENT", "EMERGENT")

# Rank for comparing two tiers, matching triage.Tier's ordering.
TIER_RANK: dict[str, int] = {"SELF_CARE": 1, "URGENT": 2, "EMERGENT": 3}
