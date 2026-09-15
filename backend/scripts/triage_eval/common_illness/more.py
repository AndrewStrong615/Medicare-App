"""
A second batch of common presentations: the long tail of what people look up.

See `presentations.py` for how a gold tier is assigned. Same rule throughout:
EMERGENT only where `app.core.emergency` already defines a category covering
the description, and `escalation_deferred` noted where a reviewer might
reasonably want one that does not exist.
"""

from __future__ import annotations

from .presentations import P, Presentation

MORE: list[Presentation] = [
    # --- ENT and hearing -----------------------------------------------
    P(
        "tinnitus", "Tinnitus", "URGENT", "safe default",
        (
            "ringing in my ears that won't stop",
            "tinnitus, a constant hiss in one ear",
            "a buzzing noise in my ears at night",
        ),
    ),
    P(
        "hearing_loss", "Hearing loss", "URGENT", "safe default",
        (
            "my hearing has gone muffled on one side",
            "I am struggling to hear conversations",
        ),
    ),
    P(
        "ear_wax", "Ear wax blockage", "URGENT", "safe default",
        (
            "my ear feels blocked with wax",
            "ear wax and muffled hearing",
        ),
    ),
    P(
        "post_nasal_drip", "Post-nasal drip", "SELF_CARE",
        "self-care list: congestion",
        (
            "congestion and a tickly cough at night",
            "a stuffy nose and mucus running down my throat",
        ),
    ),
    P(
        "deviated_septum", "Deviated septum", "SELF_CARE",
        "self-care list: blocked nose",
        (
            "a blocked nose on one side all the time",
        ),
    ),
    # --- Eyes -----------------------------------------------------------
    P(
        "floaters", "Eye floaters", "URGENT", "safe default",
        (
            "little specks drifting across my vision",
            "floaters in my eye that I keep noticing",
        ),
    ),
    P(
        "blepharitis", "Blepharitis", "URGENT", "urgent rule: eye_symptoms",
        (
            "crusty sore eyelids in the morning with eye pain",
            "my eye is red and painful along the lid",
        ),
    ),
    P(
        "corneal_abrasion", "Corneal abrasion", "URGENT",
        "urgent rule: eye_symptoms",
        (
            "it feels like something is in my eye and it won't come out",
            "eye pain after something blew into it",
        ),
    ),
    # --- Skin, the long tail --------------------------------------------
    P(
        "ingrown_toenail", "Ingrown toenail", "URGENT",
        "urgent rule: infection_signs",
        (
            "my toenail is digging in and there is pus",
            "an ingrown toenail, red and oozing",
        ),
    ),
    P(
        "blister", "Blister", "SELF_CARE", "self-care list: minor burn / small cut",
        (
            "a small blister on my heel from new shoes",
        ),
    ),
    P(
        "splinter", "Splinter", "SELF_CARE", "self-care list: small cut",
        (
            "a small cut where a splinter went in",
        ),
    ),
    P(
        "bunion", "Bunion", "URGENT", "safe default",
        (
            "a bony bump on the side of my big toe",
            "bunions that rub in my shoes",
        ),
    ),
    P(
        "corns_callus", "Corns and calluses", "SELF_CARE",
        "self-care list: dry skin",
        (
            "hard dry skin on the ball of my foot",
        ),
    ),
    P(
        "folliculitis", "Folliculitis", "URGENT", "safe default",
        (
            "little red bumps around hair follicles after shaving",
            "razor bumps on my neck",
        ),
    ),
    P(
        "hidradenitis", "Hidradenitis suppurativa", "URGENT",
        "urgent rule: infection_signs",
        (
            "recurring painful boils in my armpit with pus",
        ),
    ),
    P(
        "vitiligo", "Vitiligo", "URGENT", "safe default",
        (
            "pale patches of skin appearing on my hands",
        ),
    ),
    P(
        "hair_loss", "Hair loss", "URGENT", "safe default",
        (
            "my hair is thinning on top",
            "hair coming out in handfuls",
        ),
    ),
    # --- Digestive, the long tail ---------------------------------------
    P(
        "gastritis", "Gastritis", "URGENT", "safe default",
        (
            "a burning ache in my upper stomach after coffee",
            "gastritis, queasy and sore stomach",
        ),
    ),
    P(
        "fatty_liver", "Fatty liver disease", "URGENT", "safe default",
        (
            "my liver enzymes came back raised",
            "fatty liver on a scan",
        ),
    ),
    P(
        "anal_fissure", "Anal fissure", "URGENT",
        "escalating modifier: bleeding",
        (
            "sharp pain and bright bleeding when I go",
        ),
    ),
    P(
        "ibd", "Inflammatory bowel disease", "URGENT",
        "urgent rule: persistent_or_worsening",
        (
            "bloody diarrhea and cramping for weeks",
            "crohn's flare, going constantly and losing weight",
        ),
    ),
    P(
        "gastroparesis", "Gastroparesis", "URGENT", "safe default",
        (
            "I feel full after a few bites and bloated",
        ),
    ),
    # --- Kidney, urinary ------------------------------------------------
    P(
        "ckd", "Chronic kidney disease", "URGENT", "safe default",
        (
            "my kidney function came back reduced",
            "swollen ankles and my kidneys are not great",
        ),
    ),
    P(
        "incontinence", "Urinary incontinence", "URGENT", "safe default",
        (
            "I leak a bit when I cough or laugh",
            "urinary incontinence since having children",
        ),
    ),
    P(
        "hematuria", "Blood in urine", "URGENT",
        "escalating modifier: blood (escalation_deferred)",
        (
            "there is blood in my urine",
            "my pee has gone pink",
        ),
    ),
    # --- Bones, joints, the long tail -----------------------------------
    P(
        "osteoporosis", "Osteoporosis", "URGENT", "safe default",
        (
            "my bone density scan came back low",
            "osteoporosis and I am worried about falls",
        ),
    ),
    P(
        "bursitis", "Bursitis", "URGENT", "safe default",
        (
            "a swollen tender lump on my elbow",
            "bursitis in my hip, sore lying on that side",
        ),
    ),
    P(
        "ganglion", "Ganglion cyst", "URGENT",
        "urgent rule: new_lump_or_unexplained_change",
        (
            "a new lump on my wrist that moves",
        ),
    ),
    P(
        "whiplash", "Whiplash", "URGENT", "safe default",
        (
            "my neck is sore and stiff after a car shunt",
        ),
    ),
    P(
        "scoliosis", "Scoliosis", "URGENT", "safe default",
        (
            "my spine curves and my back aches",
        ),
    ),
    P(
        "restless_legs", "Restless legs syndrome", "URGENT", "safe default",
        (
            "an urge to move my legs every night in bed",
            "restless legs keeping me awake",
        ),
    ),
    P(
        "growing_pains", "Growing pains", "URGENT",
        "urgent rule: infant_or_young_child",
        (
            "my toddler complains of achy legs at night",
        ),
    ),
    # --- Systemic, screening, chronic -----------------------------------
    P(
        "lupus", "Lupus", "URGENT", "safe default",
        (
            "joint pain, a rash across my cheeks and fatigue",
            "lupus flare, aching and tired",
        ),
    ),
    P(
        "thyroid_nodule", "Thyroid nodule", "URGENT",
        "urgent rule: new_lump_or_unexplained_change",
        (
            "a new lump in the front of my neck that moves when I swallow",
        ),
    ),
    P(
        "breast_lump", "Breast lump", "URGENT",
        "urgent rule: new_lump_or_unexplained_change",
        (
            "I found a lump in my breast",
            "a new lump in my breast that wasn't there before",
        ),
    ),
    P(
        "prostate_screening", "Prostate concern", "URGENT", "safe default",
        (
            "my psa came back raised",
        ),
    ),
    P(
        "colon_screening", "Bowel habit change", "URGENT",
        "urgent rule: persistent_or_worsening",
        (
            "my bowel habit has changed for weeks and there is blood",
        ),
    ),
    P(
        "shingles_vaccine", "Vaccine reaction", "URGENT",
        "urgent rule: medication_reaction",
        (
            "a sore arm and a new rash after taking my vaccine",
        ),
    ),
    P(
        "allergic_rhinitis_child", "Allergies in a child", "URGENT",
        "urgent rule: infant_or_young_child",
        (
            "my toddler is sneezing and has a runny nose every spring",
        ),
    ),
    P(
        "altitude_sickness", "Altitude sickness", "URGENT", "safe default",
        (
            "a headache and nausea since arriving in the mountains",
        ),
    ),
    P(
        "jet_lag", "Jet lag", "URGENT", "safe default",
        (
            "I can't sleep at the right times since flying",
        ),
    ),
    P(
        "caffeine_jitters", "Caffeine excess", "URGENT", "safe default",
        (
            "jittery and my heart is racing after too much coffee",
        ),
    ),
    P(
        "dry_mouth", "Dry mouth", "SELF_CARE", "self-care list: dry skin",
        (
            "a dry mouth and chapped lips at night",
        ),
    ),
    P(
        "bad_breath", "Halitosis", "URGENT", "safe default",
        (
            "persistent bad breath even after brushing",
        ),
    ),
    P(
        "excess_sweating", "Hyperhidrosis", "URGENT", "safe default",
        (
            "my hands sweat constantly no matter the weather",
        ),
    ),
]
