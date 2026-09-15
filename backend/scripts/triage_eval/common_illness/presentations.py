"""
The presentation catalogue: common American illnesses in lay language.

SYNTHETIC ONLY. Every string here was written by an engineer against no real
person, from general knowledge of how people describe complaints. CLAUDE.md
forbids real symptom data anywhere in this repository and that applies with
most force to a file that is nothing but symptom descriptions.

## ⛔ How a gold tier here is assigned, and the one rule that matters

A gold label is **the tier this app's own documented intent says it should
return** — never a clinical judgement about a real presentation, and never
this author's opinion about how dangerous an illness is.

That distinction has one concrete, load-bearing consequence:

    A presentation is labelled EMERGENT **only** where `app.core.emergency`
    ALREADY defines a category whose own reviewed copy covers it.

There are twelve such categories: cardiac, breathing, stroke, bleeding_trauma,
anaphylaxis, consciousness, self_harm, vision_loss, sepsis_meningitis,
infant_fever, pregnancy, overdose_poisoning. A description is labelled
EMERGENT when it is a lay phrasing of one of those and nothing else.

Plenty of illnesses in this file are genuinely time-critical and are *not*
labelled EMERGENT — appendicitis, testicular torsion, diabetic ketoacidosis,
sepsis without the named signs. Labelling those EMERGENT would assert a **new
clinical claim**, and CLAUDE.md fences exactly that: adding a red-flag
category is a clinician's call, not an engineer's, and
`test_the_set_of_combinations_is_fenced` exists to stop it happening by edit.
They carry `escalation_deferred` in their basis, which is this corpus's way of
saying *a reviewer may well want this higher, and that is a conversation, not
a line to change here*.

`URGENT` covers both a matched urgent rule and the safe default. `SELF_CARE`
is only ever assigned where the complaint is one the self-care list's own
spirit covers — an ordinary, self-limiting, unmodified complaint.

## `complaints`

Lay phrasings. The point of the whole exercise: matching your own phrase list
is trivial, so the corpus is built out of the words people actually use.
Where a phrase is copied verbatim from a rule list it is marked with a leading
"=" and the generator records it as non-natural.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Presentation:
    key: str
    label: str
    gold: str  # "EMERGENT" | "URGENT" | "SELF_CARE"
    basis: str
    complaints: tuple[str, ...]
    # True where the red flag is TWO concepts that have to be read together —
    # "bleeding" *and* "pregnant", rather than any single phrase. A literal
    # phrase list can express those only in the word orders someone thought
    # to write down, so when a pasted list drops the conjunction between them
    # there is nothing left for a literal to hook on.
    #
    # The app's own answer to this is `app.core.symptom_concepts`, and
    # CLAUDE.md fences it at exactly three combinations: "A fourth
    # combination is a new clinical claim and needs the clinician sign-off
    # this file requires ... that is a conversation rather than a line to
    # edit." So the generator marks these cases as documented gaps, excluded
    # from the scores and listed in full, rather than a phrase being fitted to
    # them. See the 2026-09-14 findings in CLAUDE.md.
    two_concept: bool = False


P = Presentation

# ---------------------------------------------------------------------------
# RESPIRATORY, ENT, AND THE ORDINARY SEASONAL ILLNESSES
# ---------------------------------------------------------------------------

RESPIRATORY: list[Presentation] = [
    P(
        "common_cold", "Common cold", "SELF_CARE", "self-care list",
        (
            "=a cold",
            "=runny nose",
            "a runny nose and some sneezing",
            "a stuffy nose and a scratchy throat",
            "the sniffles",
            "a head cold",
            "a blocked nose and sneezing",
            "a bit of a cold coming on",
        ),
    ),
    P(
        "sore_throat", "Sore throat", "SELF_CARE", "self-care list",
        (
            "=sore throat",
            "a scratchy throat",
            "a sore throat",
            "my throat feels raw",
            "a bit of a sore throat",
            "a tickle in my throat",
        ),
    ),
    P(
        "cough_mild", "Mild cough", "SELF_CARE", "self-care list",
        (
            "=mild cough",
            "=dry cough",
            "a tickly cough",
            "a little dry cough",
            "a mild cough that comes and goes",
        ),
    ),
    P(
        "seasonal_allergies", "Seasonal allergies", "SELF_CARE",
        "self-care list: congestion / sneezing",
        (
            "hay fever, sneezing and a runny nose",
            "my allergies are acting up, runny nose and sneezing",
            "itchy eyes and a runny nose from pollen",
            "sneezing all morning and congestion",
            "seasonal allergies with a stuffy nose",
        ),
    ),
    P(
        "influenza", "Influenza (flu)", "URGENT",
        "urgent rule: fever_with_duration",
        (
            "body aches, chills and a high fever",
            "I think I have the flu, aching all over with a high fever",
            "high fever and my whole body hurts",
            "the flu, high fever and exhaustion for three days",
            "a temperature of 103 and terrible body aches",
        ),
    ),
    P(
        "covid19", "COVID-19", "URGENT", "safe default",
        (
            "I tested positive for covid and feel awful",
            "lost my sense of taste and have a cough",
            "covid symptoms, a temperature and a cough",
            "positive covid test with a bad headache",
        ),
    ),
    P(
        "sinusitis", "Sinusitis", "URGENT",
        "urgent rule: persistent_or_worsening",
        (
            "sinus pressure and congestion that won't go away",
            "my face aches under my eyes and my nose has been blocked for two weeks",
            "a sinus infection, pressure behind my cheeks that is getting worse",
            "stuffy for over a week with pressure in my forehead",
        ),
    ),
    P(
        "strep_throat", "Strep throat", "URGENT",
        "urgent rule: fever_with_duration",
        (
            "a sore throat with white patches and a high fever",
            "it hurts to swallow and I have a high fever",
            "strep throat, swollen glands and a high fever",
            "my throat is killing me and my glands are up with a high fever",
        ),
    ),
    P(
        "bronchitis", "Acute bronchitis", "URGENT",
        "urgent rule: persistent_or_worsening",
        (
            "a chesty cough that has gone on for over a week",
            "coughing up phlegm for two weeks",
            "a rattly cough that is not getting better",
            "bronchitis, coughing for weeks",
        ),
    ),
    P(
        "pneumonia", "Pneumonia", "EMERGENT", "screening intent: breathing",
        (
            "a bad cough with fever and I am short of breath",
            "pneumonia, I am having trouble breathing",
            "coughing, fever and difficulty breathing",
            "my chest hurts when I breathe and I can't catch my breath",
        ),
    ),
    P(
        "asthma_attack", "Asthma attack", "EMERGENT", "screening intent: breathing",
        (
            "my asthma is flaring and I can't catch my breath",
            "wheezing and struggling to breathe",
            "an asthma attack, hard time breathing",
            "my inhaler isn't helping and I can't breathe properly",
        ),
    ),
    P(
        "copd_flare", "COPD flare", "EMERGENT", "screening intent: breathing",
        (
            "my copd is worse and I am short of breath",
            "emphysema and trouble breathing today",
            "more breathless than usual with my copd, struggling to breathe",
        ),
    ),
    P(
        "rsv_child", "RSV in a child", "URGENT",
        "urgent rule: infant_or_young_child",
        (
            "my toddler has rsv and a bad cough",
            "my baby is coughing a lot",
            "my infant has a rattly chest",
        ),
    ),
    P(
        "croup", "Croup", "URGENT", "urgent rule: infant_or_young_child",
        (
            "my toddler has a barking cough",
            "my baby has a barky cough at night",
            "my toddler sounds like a seal when he coughs",
        ),
    ),
    P(
        "laryngitis", "Laryngitis", "SELF_CARE", "self-care list: sore throat",
        (
            "I have lost my voice and my throat is scratchy",
            "laryngitis, hoarse with a sore throat",
            "my voice is croaky and my throat is a bit sore",
        ),
    ),
    P(
        "tonsillitis", "Tonsillitis", "URGENT",
        "urgent rule: fever_with_duration",
        (
            "my tonsils are swollen and I have a high fever",
            "tonsillitis, painful swallowing and a high fever",
            "swollen tonsils with white spots and a high fever",
        ),
    ),
    P(
        "mono", "Infectious mononucleosis", "URGENT",
        "urgent rule: persistent_or_worsening",
        (
            "sore throat for over two weeks, swollen glands and exhausted",
            "mono, extreme tiredness for weeks",
            "swollen glands and tired for a month",
        ),
    ),
    P(
        "whooping_cough", "Whooping cough", "URGENT",
        "urgent rule: persistent_or_worsening",
        (
            "coughing fits that won't go away and a whoop",
            "whooping cough, coughing fits for weeks",
            "violent coughing fits for over a week",
        ),
    ),
    P(
        "ear_infection", "Middle ear infection", "URGENT", "safe default",
        (
            "my ear hurts and feels full",
            "an ear infection, throbbing pain in my ear",
            "earache with muffled hearing",
            "my ear is aching and there is fluid coming out",
        ),
    ),
    P(
        "swimmers_ear", "Swimmer's ear", "URGENT", "safe default",
        (
            "my ear canal is sore after swimming",
            "swimmer's ear, itchy and painful outer ear",
            "my ear hurts when I tug on it",
        ),
    ),
    P(
        "sleep_apnea", "Sleep apnea", "URGENT", "safe default",
        (
            "I snore badly and my partner says I stop breathing in my sleep",
            "sleep apnea, tired all day and loud snoring",
            "I wake up gasping at night",
        ),
    ),
    P(
        "nosebleed", "Nosebleed", "URGENT", "safe default",
        (
            "a nosebleed that keeps starting again",
            "frequent nosebleeds this week",
            "my nose keeps bleeding every morning",
        ),
    ),
    P(
        "pulmonary_embolism", "Pulmonary embolism", "EMERGENT",
        "screening intent: breathing",
        (
            "sudden shortness of breath and sharp chest pain",
            "I can't breathe and my chest hurts when I breathe in",
            "sudden difficulty breathing after a long flight",
        ),
    ),
]
