"""
Gastrointestinal, urinary, reproductive and sexual-health presentations.

See `presentations.py` for how a gold tier is assigned.

`escalation_deferred` appears often here. Appendicitis, a bowel obstruction,
testicular torsion and an ectopic pregnancy are all time-critical and none of
them is a category `app.core.emergency` defines. Where such a description
carries no phrase the existing screening already covers, it is labelled URGENT
and flagged — proposing a new red-flag category is a clinician's call.

The one exception is pregnancy: `emergency.py` does define a pregnancy
category, and its own copy names "bleeding or severe abdominal pain during
pregnancy". Descriptions matching that copy are labelled EMERGENT on the
strength of the copy that already exists.
"""

from __future__ import annotations

from .presentations import P, Presentation

GI: list[Presentation] = [
    P(
        "gastroenteritis", "Stomach flu / gastroenteritis", "URGENT",
        "urgent rule: cannot_keep_fluids_down",
        (
            "throwing up everything I drink",
            "a stomach bug, vomiting and diarrhea since last night",
            "I can't keep anything down",
            "stomach flu, nausea and the runs",
        ),
    ),
    P(
        "food_poisoning", "Food poisoning", "URGENT",
        "urgent rule: cannot_keep_fluids_down",
        (
            "vomiting everything after eating out last night",
            "food poisoning, cramps and diarrhea",
            "I ate something bad and can't keep fluids down",
        ),
    ),
    P(
        "heartburn", "Heartburn / GERD", "SELF_CARE", "self-care list",
        (
            "=mild heartburn",
            "=indigestion",
            "a bit of indigestion after a big meal",
            "mild heartburn in the evenings",
            "acid reflux after spicy food",
        ),
    ),
    P(
        "constipation", "Constipation", "URGENT", "safe default",
        (
            "I haven't been able to go for four days",
            "constipation and bloating",
            "hard stools and straining",
        ),
    ),
    P(
        "diarrhea", "Diarrhea", "URGENT", "safe default",
        (
            "loose stools since yesterday",
            "diarrhea and stomach cramps",
        ),
    ),
    P(
        "ibs", "Irritable bowel syndrome", "URGENT", "safe default",
        (
            "bloating and cramping that comes and goes for months",
            "ibs, alternating constipation and diarrhea",
        ),
    ),
    P(
        "hemorrhoids", "Hemorrhoids", "URGENT",
        "escalating modifier: bleeding",
        (
            "itching and bleeding when I go to the bathroom",
            "hemorrhoids, sore and bleeding a little",
        ),
    ),
    P(
        "appendicitis", "Appendicitis", "URGENT",
        "urgent rule: severe_pain (escalation_deferred: no abdominal category)",
        (
            "severe pain that started near my belly button and moved to my lower right side",
            "appendicitis, unbearable pain in my right lower abdomen",
            "my lower right belly is agony to touch",
        ),
    ),
    P(
        "gallstones", "Gallstones", "URGENT", "urgent rule: severe_pain",
        (
            "severe pain under my right ribs after a fatty meal",
            "gallstones, excruciating pain in my upper belly",
        ),
    ),
    P(
        "peptic_ulcer", "Peptic ulcer", "URGENT", "safe default",
        (
            "a burning pain in my stomach that eases when I eat",
            "a stomach ulcer, gnawing pain at night",
        ),
    ),
    P(
        "gi_bleed", "Gastrointestinal bleeding", "EMERGENT",
        "screening intent: bleeding_trauma",
        (
            "I am vomiting blood",
            "black tarry stools and I threw up blood",
        ),
    ),
    P(
        "diverticulitis", "Diverticulitis", "URGENT",
        "urgent rule: severe_pain / fever_with_duration",
        (
            "severe pain in my lower left belly with a high fever",
            "diverticulitis flare, tender lower abdomen and high fever",
        ),
    ),
    P(
        "pancreatitis", "Pancreatitis", "URGENT", "urgent rule: severe_pain",
        (
            "severe pain going through to my back and I am vomiting",
            "pancreatitis, unbearable upper abdominal pain",
        ),
    ),
    P(
        "celiac", "Celiac disease", "URGENT", "safe default",
        (
            "bloating and diarrhea whenever I eat bread",
            "celiac, stomach upset after gluten",
        ),
    ),
    P(
        "lactose", "Lactose intolerance", "URGENT", "safe default",
        (
            "gas and bloating after dairy",
            "lactose intolerance, cramps after milk",
        ),
    ),
    P(
        "norovirus", "Norovirus", "URGENT",
        "urgent rule: cannot_keep_fluids_down",
        (
            "sudden vomiting and diarrhea, can't keep fluids down",
            "norovirus going round, throwing up everything",
        ),
    ),
    P(
        "bowel_obstruction", "Bowel obstruction", "URGENT",
        "urgent rule: severe_pain (escalation_deferred)",
        (
            "severe cramping, vomiting and I haven't passed anything for two days",
            "a blocked bowel, distended and in agony",
        ),
    ),
    P(
        "hepatitis", "Hepatitis", "URGENT", "safe default",
        (
            "my eyes and skin have gone yellow",
            "hepatitis, jaundice and dark urine",
        ),
    ),
    P(
        "hernia", "Hernia", "URGENT",
        "urgent rule: new_lump_or_unexplained_change",
        (
            "a new lump in my groin that bulges when I cough",
            "a hernia, a soft lump in my belly",
        ),
    ),
]

GU: list[Presentation] = [
    P(
        "uti", "Urinary tract infection", "URGENT", "safe default",
        (
            "burning when I pee and going constantly",
            "a urine infection, stinging and urgency",
            "painful urination since yesterday",
        ),
    ),
    P(
        "pyelonephritis", "Kidney infection", "URGENT",
        "urgent rule: fever_with_duration",
        (
            "burning when I pee with back pain and a high fever",
            "a kidney infection, high fever and flank pain",
        ),
    ),
    P(
        "kidney_stone", "Kidney stone", "URGENT", "urgent rule: severe_pain",
        (
            "excruciating pain in my side that comes in waves",
            "a kidney stone, the worst pain in my back and groin",
        ),
    ),
    P(
        "bph", "Enlarged prostate", "URGENT", "safe default",
        (
            "getting up several times a night to pee",
            "a weak stream and trouble starting",
        ),
    ),
    P(
        "prostatitis", "Prostatitis", "URGENT", "safe default",
        (
            "pain between my legs and burning when I pee",
            "prostatitis, aching pelvis",
        ),
    ),
    P(
        "testicular_torsion", "Testicular torsion", "URGENT",
        "urgent rule: severe_pain (escalation_deferred: no torsion category)",
        (
            "sudden excruciating pain in one testicle",
            "unbearable pain in my testicle that came on suddenly",
        ),
    ),
    P(
        "yeast_infection", "Vaginal yeast infection", "URGENT", "safe default",
        (
            "itching and thick discharge",
            "a yeast infection, soreness and irritation",
        ),
    ),
    P(
        "bv", "Bacterial vaginosis", "URGENT", "safe default",
        (
            "unusual discharge with a fishy smell",
            "bacterial vaginosis symptoms",
        ),
    ),
    P(
        "sti", "Sexually transmitted infection", "URGENT", "safe default",
        (
            "a sore on my genitals and discharge",
            "I think I have an sti after unprotected sex",
            "burning when I pee and discharge",
        ),
    ),
    P(
        "menstrual_cramps", "Menstrual cramps", "URGENT", "safe default",
        (
            "period cramps low in my belly",
            "painful periods every month",
        ),
    ),
    P(
        "endometriosis", "Endometriosis", "URGENT", "urgent rule: severe_pain",
        (
            "severe period pain that stops me working",
            "endometriosis, excruciating pelvic pain",
        ),
    ),
    P(
        "ovarian_cyst", "Ovarian cyst", "URGENT", "safe default",
        (
            "a dull ache on one side of my pelvis",
            "an ovarian cyst, bloating and one-sided pain",
        ),
    ),
    P(
        "pregnancy_bleeding", "Bleeding in pregnancy", "EMERGENT",
        "screening intent: pregnancy",
        (
            "=pregnant and bleeding",
            "I am bleeding and I am pregnant",
            "spotting and cramping while pregnant",
        ),
        two_concept=True,
    ),
    P(
        "ectopic", "Ectopic pregnancy", "EMERGENT",
        "screening intent: pregnancy",
        (
            "severe one-sided pain and I am pregnant",
            "pregnant with severe abdominal pain and shoulder tip pain",
        ),
        two_concept=True,
    ),
    P(
        "morning_sickness", "Morning sickness", "URGENT",
        "urgent rule: pregnancy_related",
        (
            "nausea every morning and I am pregnant",
            "morning sickness at eight weeks pregnant",
        ),
    ),
    P(
        "menopause", "Menopause", "URGENT", "safe default",
        (
            "hot flashes and trouble sleeping",
            "menopause, night sweats and mood swings",
        ),
    ),
    P(
        "ed", "Erectile dysfunction", "URGENT", "safe default",
        (
            "trouble getting an erection",
            "erectile dysfunction for a few months",
        ),
    ),
]
