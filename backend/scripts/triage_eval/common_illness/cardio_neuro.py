"""
Cardiovascular, neurological and endocrine presentations.

See `presentations.py` for how a gold tier is assigned. The short version, and
it governs this file more than any other: EMERGENT is only ever used where
`app.core.emergency` already defines a category covering the description.

This is where the temptation to over-label is strongest. A deep vein
thrombosis, a hypertensive crisis and diabetic ketoacidosis are all
time-critical, and none of them is an emergency category this app defines. Any
of them phrased without a named red flag is labelled URGENT with
`escalation_deferred`, because inventing a category is the clinician's call
this repository fences.
"""

from __future__ import annotations

from .presentations import P, Presentation

CARDIO: list[Presentation] = [
    P(
        "heart_attack", "Heart attack", "EMERGENT", "screening intent: cardiac",
        (
            "=chest pain",
            "crushing pressure in my chest going into my jaw",
            "my chest feels tight and I am sweating",
            "I think I am having a heart attack",
            "pain in my chest that spreads to my left arm",
            "heavy pressure on my chest and I feel sick",
        ),
    ),
    P(
        "angina", "Angina", "EMERGENT", "screening intent: cardiac",
        (
            "chest tightness when I walk uphill",
            "angina, chest pain on exertion",
            "my chest gets tight when I exercise",
        ),
    ),
    P(
        "heart_failure", "Heart failure", "EMERGENT", "screening intent: breathing",
        (
            "my ankles are swollen and I am short of breath",
            "heart failure, breathless lying flat",
            "I get out of breath walking to the mailbox",
        ),
    ),
    P(
        "afib", "Atrial fibrillation / palpitations", "URGENT",
        "safe default (escalation_deferred: no arrhythmia category exists)",
        (
            "my heart is racing and fluttering",
            "heart palpitations that come and go",
            "my heart feels like it is skipping beats",
            "atrial fibrillation, irregular heartbeat today",
        ),
    ),
    P(
        "hypertension", "High blood pressure", "URGENT",
        "safe default (escalation_deferred: no hypertensive-crisis category)",
        (
            "my blood pressure reading was very high",
            "high blood pressure and a headache",
            "my bp is 180 over 110",
        ),
    ),
    P(
        "high_cholesterol", "High cholesterol", "URGENT", "safe default",
        (
            "my cholesterol came back high",
            "high cholesterol on my blood test",
        ),
    ),
    P(
        "dvt", "Deep vein thrombosis", "URGENT",
        "safe default (escalation_deferred: no clot category exists)",
        (
            "my calf is swollen, hot and painful",
            "one leg is much more swollen than the other and it aches",
            "a blood clot in my leg, red and tender",
        ),
    ),
    P(
        "varicose_veins", "Varicose veins", "URGENT", "safe default",
        (
            "bulging veins in my legs that ache",
            "varicose veins and tired legs",
        ),
    ),
    P(
        "anemia", "Anemia", "URGENT", "safe default",
        (
            "I am tired all the time and look pale",
            "anemia, exhausted and dizzy when I stand",
            "low iron and constant tiredness",
        ),
    ),
    P(
        "peripheral_artery", "Peripheral artery disease", "URGENT", "safe default",
        (
            "my legs cramp when I walk and stop when I rest",
            "poor circulation and cold feet",
        ),
    ),
]

NEURO: list[Presentation] = [
    P(
        "stroke", "Stroke", "EMERGENT", "screening intent: stroke",
        (
            "=face drooping",
            "my face is drooping on one side and I am slurring my words",
            "sudden numbness down one side of my body",
            "I am slurring my speech and my arm feels weak",
            "one side of my face has dropped",
            "sudden weakness on my right side and I can't get my words out",
        ),
    ),
    P(
        "tia", "Transient ischemic attack", "EMERGENT", "screening intent: stroke",
        (
            "my arm went weak for ten minutes then came back",
            "sudden numbness in my hand that passed",
            "I had slurred speech for a few minutes",
        ),
    ),
    P(
        "tension_headache", "Tension headache", "SELF_CARE", "self-care list",
        (
            "=tension headache",
            "=mild headache",
            "a slight headache from staring at screens",
            "a dull headache across my forehead",
            "a mild headache at the end of the day",
        ),
    ),
    P(
        "migraine", "Migraine", "URGENT",
        "urgent rule: eye_symptoms (light sensitivity) / safe default",
        (
            "a migraine with light hurting my eyes and nausea",
            "a throbbing headache on one side with flashing lights",
            "migraine, I have to lie in a dark room",
        ),
    ),
    P(
        "cluster_headache", "Cluster headache", "URGENT",
        "urgent rule: severe_pain",
        (
            "excruciating pain behind one eye at the same time each night",
            "cluster headaches, unbearable stabbing behind my eye",
        ),
    ),
    P(
        "subarachnoid", "Thunderclap headache", "EMERGENT", "screening intent: stroke",
        (
            "=worst headache of my life",
            "the worst headache of my life came on out of nowhere",
            "a sudden severe headache like being hit in the head",
        ),
    ),
    P(
        "concussion", "Concussion", "EMERGENT", "screening intent: bleeding_trauma",
        (
            "I hit my head hard and feel awful",
            "a head injury from falling off my bike",
            "I banged my head and now I feel sick and dizzy",
        ),
    ),
    P(
        "seizure_disorder", "Seizure", "EMERGENT", "screening intent: consciousness",
        (
            "=seizure",
            "my son had a seizure",
            "I had a convulsion and don't remember it",
        ),
    ),
    P(
        "syncope", "Fainting", "EMERGENT", "screening intent: consciousness",
        (
            "=passed out",
            "I passed out at work this morning",
            "I fainted and hit the floor",
        ),
    ),
    P(
        "vertigo", "Vertigo / BPPV", "URGENT", "safe default",
        (
            "the room is spinning when I turn over in bed",
            "vertigo, dizzy and off balance",
            "I feel like everything is spinning",
        ),
    ),
    P(
        "bells_palsy", "Bell's palsy", "EMERGENT", "screening intent: stroke",
        (
            "one side of my face has stopped moving",
            "bell's palsy, my face is drooping",
            "I can't close one eye and my mouth droops",
        ),
    ),
    P(
        "sciatica", "Sciatica", "URGENT", "safe default",
        (
            "shooting pain down the back of my leg from my lower back",
            "sciatica, my leg is tingling and sore",
            "pain from my hip down to my foot",
        ),
    ),
    P(
        "neuropathy", "Peripheral neuropathy", "URGENT",
        "escalating modifier: numbness",
        (
            "pins and needles and numbness in both feet",
            "burning and numbness in my toes at night",
            "neuropathy, my hands are numb",
        ),
    ),
    P(
        "carpal_tunnel", "Carpal tunnel syndrome", "URGENT",
        "escalating modifier: numbness",
        (
            "my hand goes numb at night and I shake it out",
            "carpal tunnel, tingling and numbness in my fingers",
        ),
    ),
    P(
        "multiple_sclerosis", "Multiple sclerosis", "URGENT",
        "escalating modifier: numbness / safe default",
        (
            "numbness and weakness that comes and goes over months",
            "ms symptoms, tingling and fatigue",
        ),
    ),
    P(
        "parkinsons", "Parkinson's disease", "URGENT", "safe default",
        (
            "a tremor in my hand at rest and I move more slowly",
            "parkinson's, stiffness and a shaky hand",
        ),
    ),
    P(
        "dementia", "Dementia", "URGENT", "safe default",
        (
            "my mother is forgetting names and getting lost",
            "memory problems that have got worse over a year",
        ),
    ),
    P(
        "meningitis", "Meningitis", "EMERGENT", "screening intent: sepsis_meningitis",
        (
            "=stiff neck and fever",
            "my neck is stiff and I have a fever",
            "a fever and I can't turn my neck",
            "a rash that doesn't fade when I press a glass on it",
        ),
    ),
]

ENDOCRINE: list[Presentation] = [
    P(
        "type2_diabetes", "Type 2 diabetes", "URGENT", "safe default",
        (
            "thirsty all the time and peeing a lot",
            "type 2 diabetes, my sugars are running high",
            "constant thirst and blurry vision",
        ),
    ),
    P(
        "hypoglycemia", "Low blood sugar", "URGENT",
        "safe default (escalation_deferred: no hypoglycemia category)",
        (
            "shaky and sweaty with low blood sugar",
            "my sugar dropped and I feel clammy",
        ),
    ),
    P(
        "dka", "Diabetic ketoacidosis (names a red flag)", "EMERGENT",
        "screening intent: breathing",
        (
            "ketoacidosis, fruity breath and trouble breathing",
        ),
    ),
    P(
        # ⛔ GOLD CORRECTED 2026-09-14, and the reason matters more than the
        # label. This was first written as EMERGENT on "screening intent:
        # breathing", and that was wrong — an over-reach by the engineer
        # writing the corpus, not a miss by the app.
        #
        # `emergency.py`'s breathing copy says "Difficulty breathing can be a
        # medical emergency." Breathing *heavily* is not difficulty
        # breathing; it is what everyone does after climbing stairs. The
        # honest reading is that this app defines no category that covers
        # ketoacidosis described without a named red flag, and adding a
        # phrase broad enough to catch it ("breathing heavily") would fire on
        # every exercise description in the country.
        #
        # ⛔ This is NOT a label moved to make a number go up. The app still
        # gets it wrong in the sense that matters — it returns URGENT by
        # *default*, having recognised nothing, rather than by understanding.
        # Closing it properly means a new red-flag category, which is a
        # clinician's call this repository fences and an engineer may not
        # make. Reported, not fixed.
        "dka_no_red_flag", "Diabetic ketoacidosis (no named red flag)",
        "URGENT",
        "safe default (escalation_deferred: no ketoacidosis category exists; "
        "reported in the 2026-09-14 findings)",
        (
            "very high sugars, vomiting and I am breathing heavily",
            "my sugars are very high and I feel sick and drowsy",
        ),
    ),
    P(
        "hypothyroid", "Hypothyroidism", "URGENT", "safe default",
        (
            "tired, cold all the time and gaining weight",
            "underactive thyroid, exhausted and dry skin",
        ),
    ),
    P(
        "hyperthyroid", "Hyperthyroidism", "URGENT", "safe default",
        (
            "losing weight without trying and my heart races",
            "overactive thyroid, sweaty and anxious",
        ),
    ),
    P(
        "gout", "Gout", "URGENT", "urgent rule: severe_pain",
        (
            "excruciating pain in my big toe, red and swollen",
            "gout flare, unbearable pain in my toe joint",
        ),
    ),
    P(
        "obesity", "Obesity", "URGENT", "safe default",
        (
            "I want help with my weight",
            "obesity and joint pain",
        ),
    ),
    P(
        "pcos", "Polycystic ovary syndrome", "URGENT", "safe default",
        (
            "irregular periods and unwanted hair growth",
            "pcos, acne and missed periods",
        ),
    ),
]
