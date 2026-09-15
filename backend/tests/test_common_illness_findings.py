"""
Guards for the defects the 10,000-case common-illness corpus found (2026-09-14).

The corpus itself is measured by `scripts/triage_eval/measure_common_illness.py`
and is not run as part of the suite — 11,272 classifications is a slow test and
a measurement is not an assertion. What lives here is the subset that must never
regress, written as literals so that weakening a corpus case cannot quietly
weaken the guard.

Three groups, and they do not carry the same safety argument:

1. **Misses.** A red flag named in words the phrase list did not spell. Fixing
   these ADDED phrases, which can only raise a tier.

2. **A false SELF_CARE.** "a cold sore" matched "a cold". The catastrophic
   direction, and the only defect in the set that was actively dangerous.

3. **Two de-escalating changes**, both authorised by the repository owner in
   conversation on 2026-09-14: the "food poisoning" exclusion, and the
   self-care vocabulary. These LOWER a tier, so unlike everything else in this
   file they are not safe by construction. The tests below are what bounds
   them — they assert the neighbours still behave.
"""

from __future__ import annotations

import pytest

from app.core import rules_triage
from app.core.emergency import screen_for_emergency


# ---------------------------------------------------------------------------
# 1. Misses: a lay phrasing of a red flag the app already screens for.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "description,category",
    [
        # cardiac — the list had "chest pressure", not "pressure in my chest"
        ("crushing pressure in my chest", "cardiac"),
        ("heavy pressure on my chest and I feel sick", "cardiac"),
        ("my chest gets tight when I walk uphill", "cardiac"),
        # breathing — "shortness of breath" is the noun nobody types
        ("my ankles are swollen and I am short of breath", "breathing"),
        ("heart failure, breathless lying flat", "breathing"),
        ("I get out of breath walking to the mailbox", "breathing"),
        ("my asthma is flaring and I can't catch my breath", "breathing"),
        # stroke — the list had the face and the arm, not the mouth or eye
        ("I can't close one eye and my mouth droops", "stroke"),
        ("sudden weakness on my right side", "stroke"),
        # bleeding / trauma
        ("I hit my head hard and feel awful", "bleeding_trauma"),
        ("I banged my head and now I feel sick and dizzy", "bleeding_trauma"),
        ("black tarry stools and I threw up blood", "bleeding_trauma"),
        # self harm — "hurt myself" did not match "hurting myself"
        ("I have been thinking about hurting myself", "self_harm"),
        ("I have been cutting myself", "self_harm"),
        # vision loss — a verb in the middle defeated the literal
        ("it is like a curtain came over my eye", "vision_loss"),
        ("sudden floaters and flashes and part of my vision is gone", "vision_loss"),
        # consciousness — "passed out" was bare but "fainted" was not
        ("I fainted and hit the floor", "consciousness"),
        ("he collapsed in the heat", "consciousness"),
        # infant fever — a parent writes that the baby feels hot
        ("my newborn feels hot", "infant_fever"),
        ("my baby is burning up", "infant_fever"),
        # pregnancy — the same two facts in the other word order
        ("I am bleeding and I am pregnant", "pregnancy"),
        ("spotting and cramping while pregnant", "pregnancy"),
    ],
)
def test_a_lay_phrasing_of_a_red_flag_is_screened(description, category):
    guidance = screen_for_emergency(description)
    assert guidance is not None, f"{description!r} matched no red flag at all"
    assert guidance.category == category
    assert rules_triage.classify(description).tier_name == "EMERGENT"


@pytest.mark.parametrize(
    "singular,plural",
    [
        ("I have chest pain", "I am getting chest pains"),
        ("she had a seizure", "she had seizures last night"),
        ("he had a convulsion", "I have been having convulsions"),
        ("I had a head injury", "I have had head injuries"),
        ("he had an overdose", "there have been two overdoses"),
        ("I had a stroke", "I have had two strokes"),
    ],
)
def test_a_plural_does_not_defeat_a_red_flag(singular, plural):
    """
    ⛔ A trailing "s" used to make an emergency description unrecognisable.

    Every phrase is compiled with a `(?!\\w)` guard and a plural "s" is a word
    character, so the guard failed on it: "I have chest pain" returned cardiac
    guidance and "I am getting chest pains" returned nothing at all. The
    second is, if anything, the more natural phrasing.
    """
    assert screen_for_emergency(singular) is not None
    assert screen_for_emergency(plural) is not None


# ---------------------------------------------------------------------------
# 2. The false SELF_CARE.
# ---------------------------------------------------------------------------


def test_a_cold_sore_is_not_a_cold():
    """
    ⛔ The one defect in this set that was actively dangerous.

    "a cold" is compiled with word boundaries, and the boundary after "cold"
    is satisfied by the space in "a cold sore" — so every cold sore earned
    SELF_CARE and was told it would settle on its own. Nothing else could
    catch it: the match was positive, so the safe default never ran.

    Both halves matter. Deleting "a cold" would have fixed it and broken the
    phrasing most people use, so the guard has to be narrow.
    """
    assert rules_triage.classify("I have a cold").tier_name == "SELF_CARE"
    assert rules_triage.classify("a cold sore coming up").tier_name != "SELF_CARE"
    assert rules_triage.classify("I have a cold sore").tier_name != "SELF_CARE"


# ---------------------------------------------------------------------------
# 3a. The "food poisoning" exclusion — the only narrowing in emergency.py.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "description",
    [
        "poisoning",
        "I think this is poisoning",
        "swallowed poison",
        "he drank bleach",
        "I took too many pills",
        "an overdose",
        "she overdosed",
        "carbon monoxide poisoning",
        "lead poisoning",
        "alcohol poisoning",
    ],
)
def test_real_poisoning_still_reaches_the_emergency_category(description):
    """
    ⛔ The bound on the only de-sensitising edit ever made to `emergency.py`.

    The exclusion voids "poisoning" when — and only when — "food" comes
    immediately before it. Everything else in that category, including the
    bare word, must be untouched. If this test ever fails, the exclusion has
    been widened and an actual poisoning is going unscreened.
    """
    guidance = screen_for_emergency(description)
    assert guidance is not None
    assert guidance.category == "overdose_poisoning"


@pytest.mark.parametrize(
    "description",
    [
        "food poisoning",
        "I have food poisoning, cramps and diarrhea",
        "food poisoning after eating out last night",
    ],
)
def test_food_poisoning_is_judged_on_what_is_described(description):
    """
    A label is not a red flag, and must not be reassurance either.

    "Food poisoning" is what people call gastroenteritis; the word
    "poisoning" inside it is a collision with a category about swallowed
    toxins. Before the exclusion this returned an instruction to call Poison
    Control.

    It must land on URGENT — judged on the cramps and the diarrhea — and
    never on SELF_CARE. Removing an emergency match must not hand the
    description to the self-care branch instead.
    """
    assert screen_for_emergency(description) is None
    assert rules_triage.classify(description).tier_name == "URGENT"


def test_food_poisoning_with_a_red_flag_still_escalates():
    """The exclusion voids one word, not the rest of the description."""
    assert (
        rules_triage.classify("food poisoning and I am vomiting blood").tier_name
        == "EMERGENT"
    )


# ---------------------------------------------------------------------------
# 3b. The self-care vocabulary — the other de-escalating change.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "description",
    [
        "a head cold",
        "the sniffles",
        "my throat feels raw",
        "a tickle in my throat",
        "a dull headache across my forehead",
        "acid reflux after spicy food",
        "a few mosquito bites from last night",
        "a bit of sunburn on my shoulders",
        "dandruff and an itchy scalp",
        "a small blister on my heel from new shoes",
        "dry cracked lips in the cold",
        "I have lost my voice and my throat is scratchy",
    ],
)
def test_an_ordinary_complaint_earns_self_care(description):
    """
    The 252 descriptions this vocabulary closed.

    An URGENT tier that fires for the sniffles is one people stop reading,
    which is what makes over-triage a real cost rather than a free safety
    margin.
    """
    assert rules_triage.classify(description).tier_name == "SELF_CARE"


@pytest.mark.parametrize(
    "description",
    [
        # A blistering sunburn is not a bit of sunburn. This one was NOT
        # caught by the corpus — a bare "sunburn" pattern passed all 11,272
        # cases and still earned SELF_CARE here. The qualifier is load-bearing.
        "sunburn with blisters and I feel faint",
        "severe sunburn",
        # Shingles is a band of blisters. A bare "blister" pattern would have
        # reassured it, which is why only the friction sites are listed.
        "a painful band of blisters on one side of my ribs",
        "an itchy blistering rash after yard work",
        # A self-care word beside a red flag must never win.
        "acid reflux and chest pain",
        "the sniffles and I am short of breath",
        "lost my voice and I am struggling to breathe",
        "a dull headache and my neck is stiff and I have a fever",
        # A self-care word beside an escalating modifier must never win.
        "a head cold and a high fever",
        "hoarse for over a month and losing weight",
        "eczema that is spreading and oozing pus",
        "dandruff and a new lump in my neck",
    ],
)
def test_a_self_care_word_never_reassures_on_a_serious_description(description):
    """
    ⛔ The bound on the self-care vocabulary.

    Widening this list is the only direction that can turn "get it checked"
    into "it will settle on its own". Each case here pairs one of the new
    words with something that must override it.
    """
    assert rules_triage.classify(description).tier_name != "SELF_CARE"
