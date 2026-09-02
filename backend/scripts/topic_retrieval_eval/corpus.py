"""
Synthetic symptom-description corpus for measuring intake retrieval accuracy.

SYNTHETIC ONLY. Every line here was written by an engineer against no real
person. CLAUDE.md forbids real symptom data anywhere in this repository.

Each complaint is a lay noun phrase of the kind people actually type, paired
with the word(s) a MedlinePlus topic title would plausibly contain. `expect`
is used only to score the harness -- nothing in the app reads it.
"""

# (lay complaint phrase, words a fair topic title could contain)
COMPLAINTS: list[tuple[str, tuple[str, ...]]] = [
    # --- head / neuro ---
    ("a headache", ("headache",)),
    ("a pounding headache", ("headache",)),
    ("migraines", ("migraine",)),
    ("dizziness", ("dizziness", "vertigo")),
    ("been feeling dizzy", ("dizziness", "vertigo")),
    ("fainting spells", ("fainting", "syncope")),
    ("a tremor in my hand", ("tremor",)),
    ("memory problems", ("memory",)),
    ("trouble concentrating", ("concentration", "memory")),
    ("a concussion from hitting my head", ("concussion", "head", "injuries")),
    # --- eyes / ears / nose / throat ---
    ("blurry vision", ("vision", "eye")),
    ("dry eyes", ("eye", "dry")),
    ("pink eye", ("pink", "conjunctivitis", "eye")),
    ("ringing in my ears", ("tinnitus", "ear")),
    ("an earache", ("earache", "ear")),
    ("hearing loss", ("hearing",)),
    ("a nosebleed", ("nosebleed", "nose")),
    ("a stuffy nose", ("nose", "congestion", "cold")),
    ("a sore throat", ("throat", "sore")),
    ("hoarseness", ("hoarseness", "voice")),
    ("tonsillitis", ("tonsil",)),
    ("a toothache", ("tooth", "dental")),
    ("bleeding gums", ("gum", "periodontal")),
    ("bad breath", ("breath", "halitosis")),
    ("mouth ulcers", ("mouth", "ulcer", "canker")),
    # --- respiratory ---
    ("a cough that will not quit", ("cough",)),
    ("a dry cough", ("cough",)),
    ("wheezing", ("wheez", "asthma", "breath")),
    ("shortness of breath", ("breath", "breathing")),
    ("chest congestion", ("congestion", "chest", "bronchitis")),
    ("bronchitis", ("bronchitis",)),
    ("a sinus infection", ("sinus",)),
    ("hay fever", ("hay", "allerg", "rhinitis")),
    ("snoring", ("snoring", "sleep")),
    ("sleep apnea", ("apnea", "sleep")),
    # --- cardiac / vascular ---
    ("heart palpitations", ("palpitation", "arrhythmia", "heart")),
    ("high blood pressure", ("blood", "pressure", "hypertension")),
    ("low blood pressure", ("blood", "pressure", "hypotension")),
    ("varicose veins", ("varicose", "vein")),
    ("cold hands and feet", ("raynaud", "circulation")),
    ("swelling in my legs", ("edema", "swelling", "leg")),
    # --- GI ---
    ("heartburn", ("heartburn", "gerd", "reflux")),
    ("acid reflux", ("reflux", "gerd", "heartburn")),
    ("nausea", ("nausea", "vomiting")),
    ("vomiting", ("vomiting", "nausea")),
    ("diarrhea", ("diarrhea",)),
    ("constipation", ("constipation",)),
    ("bloating", ("bloating", "gas", "indigestion")),
    ("stomach cramps", ("stomach", "abdominal", "cramp")),
    ("food poisoning", ("food", "poisoning", "foodborne")),
    ("hemorrhoids", ("hemorrhoid",)),
    ("irritable bowel", ("irritable", "bowel")),
    ("an ulcer in my stomach", ("ulcer", "peptic", "stomach")),
    ("gallstones", ("gallstone", "gallbladder")),
    # --- urinary / repro ---
    ("a urinary tract infection", ("urinary", "infection", "bladder")),
    ("painful urination", ("urination", "urine", "urinary")),
    ("kidney stones", ("kidney", "stone")),
    ("frequent urination", ("urination", "urine", "bladder")),
    ("menstrual cramps", ("menstrua", "period", "cramp")),
    ("heavy periods", ("menstrua", "period", "bleeding")),
    ("menopause symptoms", ("menopause",)),
    ("a yeast infection", ("yeast", "candid", "vaginal")),
    ("erectile dysfunction", ("erectile", "impotence")),
    ("prostate problems", ("prostate",)),
    # --- musculoskeletal ---
    ("lower back pain", ("back", "pain")),
    ("neck pain", ("neck", "pain")),
    ("a stiff neck", ("neck",)),
    ("shoulder pain", ("shoulder",)),
    ("tennis elbow", ("elbow", "tendinitis")),
    ("wrist pain from typing", ("wrist", "carpal", "repetitive")),
    ("carpal tunnel", ("carpal",)),
    ("knee pain", ("knee",)),
    ("a swollen ankle", ("ankle", "sprain", "swelling")),
    ("a sprained ankle", ("ankle", "sprain")),
    ("plantar fasciitis", ("plantar", "heel", "foot")),
    ("heel pain", ("heel", "foot")),
    ("arthritis in my hands", ("arthritis", "hand")),
    ("hip pain", ("hip",)),
    ("shin splints", ("shin", "leg", "sports")),
    ("a pulled muscle", ("muscle", "strain", "sprain")),
    ("leg cramps at night", ("cramp", "leg", "muscle")),
    ("sciatica", ("sciatica", "sciatic")),
    ("a frozen shoulder", ("shoulder",)),
    ("bunions", ("bunion", "foot", "toe")),
    # --- skin ---
    ("a rash on my arm", ("rash", "skin")),
    ("an itchy rash", ("rash", "itch")),
    ("eczema", ("eczema", "dermatitis")),
    ("psoriasis", ("psoriasis",)),
    ("acne", ("acne",)),
    ("hives", ("hives", "urticaria")),
    ("a sunburn", ("sunburn", "sun")),
    ("athletes foot", ("athlete", "foot", "fungal")),
    ("a wart on my finger", ("wart",)),
    ("hair loss", ("hair", "loss", "alopecia")),
    ("dandruff", ("dandruff", "scalp", "seborrheic")),
    ("dry skin", ("skin", "dry")),
    ("a cold sore", ("cold", "sore", "herpes")),
    ("an ingrown toenail", ("toenail", "nail", "toe")),
    ("shingles", ("shingles",)),
    # --- systemic / general ---
    ("a fever", ("fever",)),
    ("chills and a fever", ("fever", "chills")),
    ("the flu", ("flu", "influenza")),
    ("a cold", ("cold",)),
    ("feeling exhausted all the time", ("fatigue", "tired")),
    ("trouble sleeping", ("sleep", "insomnia")),
    ("insomnia", ("insomnia", "sleep")),
    ("anxiety", ("anxiety",)),
    ("feeling depressed", ("depression",)),
    ("stress", ("stress",)),
    ("weight gain", ("weight", "obesity")),
    ("night sweats", ("sweat", "night")),
    ("swollen glands in my neck", ("lymph", "gland", "swollen", "node")),
    ("an allergic reaction to something I ate", ("allerg", "food")),
    ("a bee sting", ("sting", "bite", "insect")),
    ("a tick bite", ("tick", "bite", "lyme")),
    ("dehydration", ("dehydration", "fluid")),
    ("high cholesterol", ("cholesterol",)),
    ("thyroid problems", ("thyroid",)),
    ("anemia", ("anemia",)),
]

# Conversational wrappers. These are the phrasings the app actually receives --
# the whole reason `search_terms` exists is that people do not type keywords.
TEMPLATES: list[str] = [
    "{c}",
    "I have {c}",
    "I have had {c} for a few days now",
    "I woke up this morning with {c}",
    "not really sure what is going on, but I have got {c}",
    "{c} and it has been driving me crazy since yesterday",
    "been dealing with {c} on and off for about a week",
    "my doctor is away and I have got {c}, should I be worried",
    "{c} started a couple of days ago and has not really let up",
    "just wondering about {c}, it has been bothering me lately",
]


def build() -> list[dict]:
    cases: list[dict] = []
    for complaint, expect in COMPLAINTS:
        for template in TEMPLATES:
            cases.append(
                {
                    "description": template.format(c=complaint),
                    "complaint": complaint,
                    "expect": expect,
                }
            )
    return cases


if __name__ == "__main__":
    cases = build()
    print(f"{len(cases)} cases from {len(COMPLAINTS)} complaints x {len(TEMPLATES)} templates")
    for case in cases[:6]:
        print(" -", case["description"])
