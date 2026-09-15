"""
Skin, musculoskeletal, eye, dental and injury presentations.

See `presentations.py` for how a gold tier is assigned.

This file carries most of the corpus's SELF_CARE mass, and that is
deliberate. CLAUDE.md calls rule coverage "the ceiling on how often SELF_CARE
can ever be earned", and the ordinary complaints — a bug bite, a bruise, a
graze, sunburn — are where a triage tool either behaves sensibly or tells
half the country to see a doctor about a mosquito. A wrongly-URGENT mosquito
bite is not a safety failure, but it is a wrong answer, and enough of them
make the URGENT tier mean nothing when it matters.
"""

from __future__ import annotations

from .presentations import P, Presentation

DERM: list[Presentation] = [
    P(
        "acne", "Acne", "URGENT", "safe default",
        (
            "breakouts on my face and back",
            "acne that flares before my period",
            "spots on my chin that keep coming back",
        ),
    ),
    P(
        "eczema", "Eczema", "SELF_CARE", "self-care list: dry skin",
        (
            "dry skin patches behind my knees that itch",
            "eczema, dry itchy skin on my hands",
            "flaky dry skin on my elbows",
        ),
    ),
    P(
        "psoriasis", "Psoriasis", "URGENT", "safe default",
        (
            "thick scaly patches on my elbows",
            "psoriasis plaques on my scalp",
        ),
    ),
    P(
        "contact_dermatitis", "Contact dermatitis", "URGENT", "safe default",
        (
            "a red itchy rash where my watch strap sits",
            "a rash after using a new detergent",
        ),
    ),
    P(
        "poison_ivy", "Poison ivy", "URGENT", "safe default",
        (
            "an itchy blistering rash after yard work",
            "poison ivy on my arms",
        ),
    ),
    P(
        "hives", "Hives / urticaria", "URGENT", "safe default",
        (
            "itchy welts that move around my body",
            "hives all over after eating strawberries",
        ),
    ),
    P(
        "anaphylaxis", "Anaphylaxis", "EMERGENT", "screening intent: anaphylaxis",
        (
            "=severe allergic reaction",
            "my throat is closing and my tongue is swelling",
            "my lips are swelling after eating a peanut",
            "hives, my face is swelling and I can't breathe",
        ),
    ),
    P(
        "shingles", "Shingles", "URGENT", "safe default",
        (
            "a painful band of blisters on one side of my ribs",
            "shingles, burning rash in a stripe",
        ),
    ),
    P(
        "cellulitis", "Cellulitis", "URGENT", "urgent rule: infection_signs",
        (
            "spreading redness and the skin is hot to touch",
            "cellulitis, red streaks going up my leg",
        ),
    ),
    P(
        "abscess", "Skin abscess / boil", "URGENT", "urgent rule: infection_signs",
        (
            "a painful boil with pus",
            "an abscess under my arm that is oozing",
        ),
    ),
    P(
        "athletes_foot", "Athlete's foot", "URGENT", "safe default",
        (
            "itchy peeling skin between my toes",
            "athlete's foot, flaky itchy feet",
        ),
    ),
    P(
        "ringworm", "Ringworm", "URGENT", "safe default",
        (
            "a round itchy patch with a raised edge",
            "ringworm on my arm",
        ),
    ),
    P(
        "warts", "Warts", "URGENT", "safe default",
        (
            "a rough lump on my finger that won't go",
            "a verruca on my foot",
        ),
    ),
    P(
        "cold_sore", "Cold sore", "URGENT", "safe default",
        (
            "a tingling blister on my lip",
            "a cold sore coming up",
        ),
    ),
    P(
        "impetigo", "Impetigo", "URGENT", "safe default",
        (
            "honey coloured crusts around my child's nose",
            "impetigo, weeping crusty sores",
        ),
    ),
    P(
        "scabies", "Scabies", "URGENT", "safe default",
        (
            "intense itching at night and tracks between my fingers",
            "scabies, itchy rash spreading in the family",
        ),
    ),
    P(
        "sunburn", "Sunburn", "SELF_CARE", "self-care list",
        (
            "=mild sunburn",
            "a bit of sunburn on my shoulders",
            "mild sunburn from the beach",
        ),
    ),
    P(
        "rosacea", "Rosacea", "URGENT", "safe default",
        (
            "redness and flushing across my cheeks",
            "rosacea, my face goes red easily",
        ),
    ),
    P(
        "melanoma_change", "Changing mole", "URGENT",
        "urgent rule: new_lump_or_unexplained_change",
        (
            "a mole has changed shape and colour",
            "a new dark spot that is growing",
        ),
    ),
    P(
        "dandruff", "Dandruff", "SELF_CARE", "self-care list: dry skin",
        (
            "dry skin flaking off my scalp",
            "dandruff and an itchy scalp",
        ),
    ),
    P(
        "bug_bite", "Insect bite", "SELF_CARE", "self-care list",
        (
            "=mosquito bite",
            "=bug bite",
            "an itchy insect bite on my ankle",
            "a few mosquito bites from last night",
        ),
    ),
    P(
        "chapped_lips", "Chapped lips", "SELF_CARE", "self-care list",
        (
            "=chapped lips",
            "dry cracked lips in the cold",
        ),
    ),
]

MSK: list[Presentation] = [
    P(
        "low_back_pain", "Low back pain", "URGENT", "safe default",
        (
            "my lower back hurts after lifting something",
            "an achy lower back for a few days",
            "back pain when I bend over",
        ),
    ),
    P(
        "neck_pain", "Neck pain", "URGENT", "safe default",
        (
            "a stiff sore neck from sleeping awkwardly",
            "my neck aches on one side",
        ),
    ),
    P(
        "ankle_sprain", "Ankle sprain", "URGENT",
        "urgent rule: possible_fracture",
        (
            "I rolled my ankle and can't put weight on it",
            "a swollen ankle that I can't walk on",
        ),
    ),
    P(
        "fracture", "Fracture", "URGENT", "urgent rule: possible_fracture",
        (
            "=broken",
            "I think I broke my wrist, it looks deformed",
            "my arm is bent the wrong way after a fall",
        ),
    ),
    P(
        "open_fracture", "Open fracture", "EMERGENT",
        "screening intent: bleeding_trauma",
        (
            "a broken bone through skin after a fall",
        ),
    ),
    P(
        "knee_pain", "Knee pain", "URGENT", "safe default",
        (
            "my knee aches going up stairs",
            "a sore knee after running",
        ),
    ),
    P(
        "osteoarthritis", "Osteoarthritis", "URGENT", "safe default",
        (
            "stiff achy joints in the morning that ease off",
            "arthritis in my hands and hips",
        ),
    ),
    P(
        "rheumatoid", "Rheumatoid arthritis", "URGENT", "safe default",
        (
            "swollen painful knuckles on both hands in the morning",
            "rheumatoid arthritis flare",
        ),
    ),
    P(
        "tendonitis", "Tendonitis", "URGENT", "safe default",
        (
            "a sore tendon in my elbow from tennis",
            "tendonitis in my shoulder",
        ),
    ),
    P(
        "plantar_fasciitis", "Plantar fasciitis", "URGENT", "safe default",
        (
            "heel pain when I get out of bed",
            "plantar fasciitis, sore arch",
        ),
    ),
    P(
        "frozen_shoulder", "Frozen shoulder", "URGENT", "safe default",
        (
            "my shoulder has gone stiff and I can't lift my arm up",
            "frozen shoulder, limited movement",
        ),
    ),
    P(
        "rotator_cuff", "Rotator cuff injury", "URGENT", "safe default",
        (
            "shoulder pain when I reach behind me",
            "a rotator cuff tear, sore lifting overhead",
        ),
    ),
    P(
        "muscle_strain", "Muscle strain", "SELF_CARE", "self-care list",
        (
            "=sore muscles",
            "=muscle ache",
            "aching after exercise yesterday",
            "sore muscles from the gym",
        ),
    ),
    P(
        "shin_splints", "Shin splints", "SELF_CARE", "self-care list: sore muscles",
        (
            "sore muscles down my shins after running",
            "aching after exercise in my lower legs",
        ),
    ),
    P(
        "fibromyalgia", "Fibromyalgia", "URGENT", "safe default",
        (
            "widespread aching and tiredness for months",
            "fibromyalgia, tender all over",
        ),
    ),
]

EYE_DENTAL: list[Presentation] = [
    P(
        "conjunctivitis", "Conjunctivitis", "URGENT",
        "urgent rule: eye_symptoms",
        (
            "my eye is red and painful with discharge",
            "pink eye, gritty and weeping",
        ),
    ),
    P(
        "stye", "Stye", "URGENT", "urgent rule: eye_symptoms",
        (
            "a painful lump on my eyelid",
            "a stye with eye pain",
        ),
    ),
    P(
        "dry_eye", "Dry eye", "URGENT", "safe default",
        (
            "my eyes feel gritty and tired at screens",
            "dry eyes in the evening",
        ),
    ),
    P(
        "retinal_detachment", "Retinal detachment", "EMERGENT",
        "screening intent: vision_loss",
        (
            "=curtain over my eye",
            "it is like a curtain came over my eye",
            "sudden floaters and flashes and part of my vision is gone",
        ),
    ),
    P(
        "acute_glaucoma", "Acute glaucoma", "URGENT",
        "urgent rule: eye_symptoms (escalation_deferred)",
        (
            "severe eye pain with halos around lights and blurry vision",
            "eye pain and my vision has gone blurry in one eye",
        ),
    ),
    P(
        "toothache", "Toothache", "URGENT", "safe default",
        (
            "a throbbing tooth that keeps me awake",
            "toothache when I drink something cold",
        ),
    ),
    P(
        "dental_abscess", "Dental abscess", "URGENT",
        "urgent rule: infection_signs",
        (
            "a swollen face with a tooth abscess and pus",
            "my gum is swollen with pus and my cheek is puffy",
        ),
    ),
    P(
        "tmj", "TMJ disorder", "URGENT", "safe default",
        (
            "my jaw clicks and aches when I chew",
            "tmj, jaw pain in the morning",
        ),
    ),
    P(
        "canker_sore", "Canker sore", "URGENT", "safe default",
        (
            "a small ulcer inside my cheek",
            "a mouth ulcer that stings",
        ),
    ),
]

INJURY: list[Presentation] = [
    P(
        "minor_cut", "Minor cut", "SELF_CARE", "self-care list",
        (
            "=paper cut",
            "=small cut",
            "a minor cut on my finger from chopping",
            "I grazed my knee",
            "I scraped my elbow",
        ),
    ),
    P(
        "deep_laceration", "Deep laceration", "URGENT",
        "urgent rule: wound_needs_review",
        (
            "a deep cut that might need stitches",
            "a gaping cut on my hand",
        ),
    ),
    P(
        "bruise", "Bruise", "SELF_CARE", "self-care list",
        (
            "=bruise",
            "a bruise on my thigh from a knock",
            "I bruised my arm on a door frame",
        ),
    ),
    P(
        "minor_burn", "Minor burn", "SELF_CARE", "self-care list",
        (
            "=minor burn",
            "=small burn",
            "a small burn on my finger from the oven",
        ),
    ),
    P(
        "animal_bite", "Animal bite", "URGENT",
        "urgent rule: wound_needs_review",
        (
            "a dog bite on my hand",
            "a cat bite that is swollen",
        ),
    ),
    P(
        "puncture", "Puncture wound", "URGENT",
        "urgent rule: wound_needs_review",
        (
            "I stood on a rusty nail",
            "a puncture wound in my foot",
        ),
    ),
    P(
        "heat_exhaustion", "Heat exhaustion", "URGENT", "safe default",
        (
            "dizzy and clammy after being out in the heat",
            "heat exhaustion, headache and nausea in the sun",
        ),
    ),
    P(
        "heat_stroke", "Heat stroke", "EMERGENT",
        "screening intent: consciousness",
        (
            "he collapsed in the heat and is unresponsive",
            "confused and passed out after working in the sun",
        ),
    ),
    P(
        "hypothermia", "Hypothermia", "URGENT",
        "safe default (escalation_deferred)",
        (
            "shivering uncontrollably after being out in the cold",
            "hypothermia, cold and drowsy",
        ),
    ),
    P(
        "frostbite", "Frostbite", "URGENT",
        "escalating modifier: numbness",
        (
            "my fingers are white and numb after the cold",
            "frostbite, numb waxy toes",
        ),
    ),
    P(
        "motion_sickness", "Motion sickness", "SELF_CARE",
        "self-care list: mild nausea",
        (
            "=mild nausea",
            "mild nausea in the car",
        ),
    ),
    P(
        "hangover", "Hangover", "SELF_CARE", "self-care list",
        (
            "=hangover",
            "a hangover after last night",
        ),
    ),
    P(
        "hiccups", "Hiccups", "SELF_CARE", "self-care list",
        (
            "=hiccups",
            "hiccups that won't stop for an hour",
        ),
    ),
]
