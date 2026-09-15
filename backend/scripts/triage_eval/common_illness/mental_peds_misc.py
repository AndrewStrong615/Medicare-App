"""
Mental health, pediatric, infectious-disease and general presentations.

See `presentations.py` for how a gold tier is assigned.

Two notes specific to this file.

**Mental health.** `self_harm` is a category `emergency.py` already defines,
and its copy routes to 988. Descriptions naming self-harm or suicidal thinking
are labelled EMERGENT on the strength of that existing copy. Depression and
anxiety *without* such language are labelled URGENT — the app has no category
for them and inventing one would be the clinical claim this corpus must not
make.

**Pediatrics.** `infant_fever` is a defined category, so a fever in a baby is
EMERGENT. Other complaints in a young child match the `infant_or_young_child`
urgent rule instead.
"""

from __future__ import annotations

from .presentations import P, Presentation

MENTAL: list[Presentation] = [
    P(
        "suicidal_ideation", "Suicidal ideation", "EMERGENT",
        "screening intent: self_harm",
        (
            "=suicidal",
            "I have been thinking about hurting myself",
            "I don't want to be here any more and I want to die",
            "thoughts of ending my life",
        ),
    ),
    P(
        "self_harm", "Self-harm", "EMERGENT", "screening intent: self_harm",
        (
            "=self harm",
            "I have been cutting myself",
            "I hurt myself last night",
        ),
    ),
    P(
        "depression", "Depression", "URGENT", "safe default",
        (
            "low mood and no interest in anything for weeks",
            "depression, crying a lot and exhausted",
            "I feel flat and can't get out of bed",
        ),
    ),
    P(
        "anxiety", "Anxiety", "URGENT", "safe default",
        (
            "constant worry and a knot in my stomach",
            "anxiety, on edge all the time",
            "I feel anxious and restless most days",
        ),
    ),
    P(
        "panic_attack", "Panic attack", "EMERGENT",
        "screening intent: breathing / cardiac",
        (
            "a panic attack, my heart is pounding and I can't breathe",
            "sudden terror with chest tightness and shortness of breath",
        ),
    ),
    P(
        "insomnia", "Insomnia", "URGENT", "safe default",
        (
            "I lie awake for hours every night",
            "insomnia, waking at three every morning",
        ),
    ),
    P(
        "ptsd", "PTSD", "URGENT", "safe default",
        (
            "flashbacks and nightmares since the accident",
            "ptsd, jumpy and avoiding places",
        ),
    ),
    P(
        "adhd", "ADHD", "URGENT", "safe default",
        (
            "I can't focus and lose track of everything",
            "adhd, restless and disorganised",
        ),
    ),
    P(
        "bipolar", "Bipolar disorder", "URGENT", "safe default",
        (
            "weeks of very high energy then crashing low",
            "bipolar, mood swings",
        ),
    ),
    P(
        "ocd", "OCD", "URGENT", "safe default",
        (
            "intrusive thoughts and checking things over and over",
            "ocd, washing my hands constantly",
        ),
    ),
    P(
        "eating_disorder", "Eating disorder", "URGENT",
        "urgent rule: new_lump_or_unexplained_change (weight loss)",
        (
            "losing weight without trying and skipping meals",
            "unexplained weight loss and worry about eating",
        ),
    ),
    P(
        "substance_use", "Substance use", "URGENT", "safe default",
        (
            "I am drinking more than I want to",
            "I can't stop using and want help",
        ),
    ),
    P(
        "overdose", "Overdose", "EMERGENT",
        "screening intent: overdose_poisoning",
        (
            "=overdose",
            "I took too many pills",
            "my friend overdosed",
        ),
    ),
    P(
        "burnout", "Burnout", "URGENT", "safe default",
        (
            "exhausted and dreading work every day",
            "burnout, nothing left in the tank",
        ),
    ),
]

PEDS: list[Presentation] = [
    P(
        "infant_fever", "Fever in an infant", "EMERGENT",
        "screening intent: infant_fever",
        (
            "=baby has a fever",
            "my baby has a fever",
            "a fever in a newborn",
            "my newborn feels hot",
        ),
    ),
    P(
        "febrile_seizure", "Febrile seizure", "EMERGENT",
        "screening intent: consciousness",
        (
            "my child had a seizure with a fever",
            "a convulsion during a fever",
        ),
    ),
    P(
        "hand_foot_mouth", "Hand, foot and mouth disease", "URGENT",
        "urgent rule: infant_or_young_child",
        (
            "my toddler has spots on his hands and feet and mouth ulcers",
            "hand foot and mouth in my toddler",
        ),
    ),
    P(
        "chickenpox", "Chickenpox", "URGENT",
        "urgent rule: infant_or_young_child",
        (
            "my toddler has itchy blisters all over",
            "chickenpox spots on my child",
        ),
    ),
    P(
        "colic", "Colic", "URGENT", "urgent rule: infant_or_young_child",
        (
            "my baby cries inconsolably every evening",
            "colic, my newborn screams after feeds",
        ),
    ),
    P(
        "teething", "Teething", "URGENT",
        "urgent rule: infant_or_young_child",
        (
            "my baby is dribbling and chewing everything",
            "teething, my infant is fretful",
        ),
    ),
    P(
        "diaper_rash", "Diaper rash", "URGENT",
        "urgent rule: infant_or_young_child",
        (
            "my baby has a red sore bottom",
            "diaper rash on my infant",
        ),
    ),
    P(
        "pinworms", "Pinworms", "URGENT", "safe default",
        (
            "my child is scratching their bottom at night",
            "pinworms, itching after bedtime",
        ),
    ),
]

INFECTIOUS: list[Presentation] = [
    P(
        "lyme", "Lyme disease", "URGENT", "safe default",
        (
            "a bullseye rash after a tick bite",
            "lyme disease, a spreading ring rash and aches",
        ),
    ),
    P(
        "sepsis", "Sepsis", "EMERGENT", "screening intent: sepsis_meningitis",
        (
            "=sepsis",
            "he is confused and has a really high temperature",
            "shivering, confused and a very high fever",
        ),
    ),
    P(
        "measles", "Measles", "URGENT",
        "urgent rule: fever_with_duration",
        (
            "a blotchy rash and a high fever",
            "measles, red eyes, cough and a high fever",
        ),
    ),
    P(
        "mrsa", "MRSA skin infection", "URGENT",
        "urgent rule: infection_signs",
        (
            "a spreading red painful lump with pus",
            "mrsa, an infected sore that is getting bigger",
        ),
    ),
    P(
        "hiv", "HIV", "URGENT", "safe default",
        (
            "I think I was exposed to hiv",
            "a flu-like illness after a risky encounter",
        ),
    ),
    P(
        "tb", "Tuberculosis", "URGENT",
        "urgent rule: new_lump_or_unexplained_change (night sweats)",
        (
            "a cough for months with night sweats and weight loss",
            "tuberculosis, night sweats and coughing",
        ),
    ),
    P(
        "cdiff", "C. difficile", "URGENT",
        "urgent rule: persistent_or_worsening",
        (
            "watery diarrhea for over a week after antibiotics",
            "c diff, frequent diarrhea that is not getting better",
        ),
    ),
    P(
        "flu_like", "Viral illness", "URGENT", "safe default",
        (
            "achy and feverish since yesterday",
            "a viral thing going round, tired and hot",
        ),
    ),
]

GENERAL: list[Presentation] = [
    P(
        "dehydration", "Dehydration", "URGENT",
        "urgent rule: cannot_keep_fluids_down",
        (
            "=dehydrated",
            "I feel dehydrated and haven't been able to drink",
        ),
    ),
    P(
        "chronic_fatigue", "Chronic fatigue", "URGENT", "safe default",
        (
            "exhausted for months no matter how much I sleep",
            "chronic fatigue, wiped out after anything",
        ),
    ),
    P(
        "medication_side_effect", "Medication side effect", "URGENT",
        "urgent rule: medication_reaction",
        (
            "a new rash after taking my antibiotic",
            "a side effect since starting the medication",
            "I think I am having a reaction to my medication",
        ),
    ),
    P(
        "vitamin_d", "Vitamin D deficiency", "URGENT", "safe default",
        (
            "tired and achy, my vitamin d was low",
            "low vitamin d on my blood test",
        ),
    ),
    P(
        "lump_unexplained", "New lump", "URGENT",
        "urgent rule: new_lump_or_unexplained_change",
        (
            "=new lump",
            "I found a lump in my neck",
            "a new lump under my arm",
        ),
    ),
    P(
        "weight_loss", "Unexplained weight loss", "URGENT",
        "urgent rule: new_lump_or_unexplained_change",
        (
            "=unexplained weight loss",
            "losing weight without trying for months",
        ),
    ),
    P(
        "night_sweats", "Night sweats", "URGENT",
        "urgent rule: new_lump_or_unexplained_change",
        (
            "=night sweats",
            "drenching night sweats for weeks",
        ),
    ),
]
