"""
Follow-up prompts for descriptions the app could not make sense of.

WHY THIS EXISTS: "I've been feeling off since this morning" matches no rule
and no health topic, so it produced a default tier and an empty screen. The
fix is to ask for more, the way any intake process does.

WHAT THESE QUESTIONS ARE: neutral elicitation. They ask the person to say
more about what they already said — where it is, how long, what else, how it
started, whether it has changed. They are the questions a receptionist asks,
not the ones a clinician asks.

WHAT THEY ARE DELIBERATELY NOT: clinical screening. There is no "does the
pain radiate to your arm", no "is the rash blanching", nothing that encodes a
threshold or tests a hypothesis. Those are clinical judgements, and CLAUDE.md
does not permit this app to author them. Every question below is fixed and
readable in one sitting — which is what makes it reviewable, and what keeps
it short of practising.

TWO ROUNDS, NOT ONE. The first round is identical for everyone. The second is
chosen from a fixed list by a short, readable rule from what the first round
returned, so someone who could not be understood is asked something *new*
rather than the same four prompts again. The selection is deterministic: the
same answers always produce the same questions, which is what a clinical
review needs. It is also capped — after round two the safe default is applied
and stated plainly, and the cap cannot be lifted by anything a client sends.

Rules that hold, each asserted by a test:

1. **A red-flag description is never asked anything, in any round.** Emergency
   screening runs first and routes straight to emergency guidance. Standing
   between someone describing chest pain and the dial button to ask how long
   it has been going on would be the worst thing this module could do.

2. **The answers are re-screened.** They are merged into the description and
   the whole thing goes through `assess` again from the top, so a red flag
   that first appears in an answer still escalates. Answers are not trusted
   to be less serious than the original text.

3. **Asking always terminates.** A round is only offered if the previous one
   came back with at least one real answer, so a client that submits nothing
   is not looped, and `MAX_ROUNDS` caps it regardless.

4. **The recap only ever repeats the user's own words.** `summarise` pairs a
   fixed label with the text the person typed or the choice they picked. It
   infers nothing, names no condition, and adds no clinical vocabulary — it
   is a receipt for what was heard, not an interpretation of it.

NOT CLINICALLY REVIEWED. Like everything else in intake, these prompts, the
round-two selection rule and the cap were written by a software engineer and
are covered by the blocking sign-off in CLAUDE.md.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass(frozen=True)
class FollowUpQuestion:
    question_id: str
    prompt: str
    # "text" for free entry, "choice" for a fixed list.
    kind: str
    choices: list[str] = field(default_factory=list)
    # Shown under the prompt. Explains why it is being asked, so the request
    # does not read as the app knowing something it has not said.
    helper: str = ""


# How many rounds of questions may be asked before the safe default stands.
# Two is a judgement, not a finding: one round left people who could not be
# understood with a boilerplate answer, and a third would start to feel like
# an interrogation of someone who is unwell. A reviewer should confirm it.
MAX_ROUNDS = 2


# ---------------------------------------------------------------------------
# Round one. Identical for every user and every complaint.
# ---------------------------------------------------------------------------

QUESTIONS: tuple[FollowUpQuestion, ...] = (
    FollowUpQuestion(
        question_id="location",
        prompt="Where in your body do you feel it?",
        kind="text",
        helper="Even roughly — \"my lower back\", \"all over\", \"hard to say\".",
    ),
    FollowUpQuestion(
        question_id="duration",
        prompt="How long has this been going on?",
        kind="choice",
        choices=[
            "Started today",
            "A few days",
            "A week or more",
            "Longer than a month",
            "I'm not sure",
        ],
    ),
    FollowUpQuestion(
        question_id="severity",
        prompt="How bad is it, from 1 to 10?",
        kind="choice",
        choices=[str(n) for n in range(1, 11)],
        helper="1 is barely noticeable, 10 is the worst you can imagine.",
    ),
    FollowUpQuestion(
        question_id="other",
        prompt="Is anything else going on alongside it?",
        kind="text",
        helper="Anything you noticed at the same time, or \"nothing else\".",
    ),
)


# ---------------------------------------------------------------------------
# Round two. Still elicitation: every one of these asks the person to recall
# something they already know about their own situation. None of them tests a
# hypothesis, and none is specific to a body system or a suspected cause.
# ---------------------------------------------------------------------------

_ONSET = FollowUpQuestion(
    question_id="onset",
    prompt="How did it start?",
    kind="choice",
    choices=[
        "Suddenly",
        "Gradually",
        "After an injury or a fall",
        "After something I ate, drank or took",
        "I'm not sure",
    ],
)

_COURSE = FollowUpQuestion(
    question_id="course",
    prompt="Since it started, has it changed?",
    kind="choice",
    choices=[
        "Getting worse",
        "Getting better",
        "About the same",
        "It comes and goes",
        "I'm not sure",
    ],
)

_PATTERN = FollowUpQuestion(
    question_id="pattern",
    prompt="Is it there all the time?",
    kind="choice",
    choices=[
        "All the time",
        "Comes and goes",
        "Only when I move or do something",
        "Mostly at night",
        "I'm not sure",
    ],
)

_PRIOR = FollowUpQuestion(
    question_id="prior",
    prompt="Have you had this before?",
    kind="choice",
    choices=[
        "No, this is new",
        "Yes, and it went away on its own",
        "Yes, and it keeps coming back",
        "I'm not sure",
    ],
)

_IMPACT = FollowUpQuestion(
    question_id="impact",
    prompt="Is it stopping you doing things you'd normally do?",
    kind="choice",
    choices=[
        "No",
        "Some things",
        "Most things",
        "I'm not sure",
    ],
)

_RECENT = FollowUpQuestion(
    question_id="recent",
    prompt="Has anything changed recently?",
    kind="text",
    helper="An illness, a new medicine, travel, an injury — or \"nothing new\".",
)

ROUND_TWO_QUESTIONS: tuple[FollowUpQuestion, ...] = (
    _ONSET,
    _COURSE,
    _PATTERN,
    _PRIOR,
    _IMPACT,
    _RECENT,
)

_ROUND_TWO_IDS = frozenset(q.question_id for q in ROUND_TWO_QUESTIONS)


INTRO = (
    "MedHelp couldn't tell what you're describing well enough to be useful. "
    "A few more details will help — and you can call 911 at any point without "
    "answering these."
)

INTRO_SECOND_ROUND = (
    "Thanks — that helps. A couple more questions and MedHelp will give you "
    "the best estimate it can. You can call 911 at any point without "
    "answering these."
)


# Answers that are present but tell us nothing. Kept as an explicit list
# rather than a cleverer test so a reviewer can see exactly what counts as
# "they could not say" — and so the recap does not report a shrug as a fact.
_NON_ANSWERS = frozenset(
    {
        "i'm not sure",
        "im not sure",
        "i am not sure",
        "not sure",
        "unsure",
        "i don't know",
        "i dont know",
        "dont know",
        "don't know",
        "no idea",
        "dunno",
        "hard to say",
        "can't say",
        "cant say",
        "?",
    }
)


def _usable(value: str) -> bool:
    """True when an answer carries something the app can actually use."""
    cleaned = value.strip().lower().rstrip(".")
    return bool(cleaned) and cleaned not in _NON_ANSWERS


def _severity(answers: dict[str, str]) -> int | None:
    raw = answers.get("severity", "").strip()
    return int(raw) if raw.isdigit() else None


# ---------------------------------------------------------------------------
# What the description already told us.
#
# WHY: round one used to ask all four questions of everyone, every time.
# Someone who writes "my throat has been sore since yesterday" was asked where
# it is and how long it has been going on — questions they had just answered.
# That reads as an app that did not listen, and a person who has been asked
# something they already said is less likely to answer carefully the next
# time, which costs the classifier the detail it actually needed.
#
# So a question is skipped when the description already answers it. These are
# lexical tests over words the person wrote — anatomy nouns, time expressions,
# intensity words. Nothing here interprets a symptom, forms a hypothesis, or
# decides what is wrong; it only asks "has this ground already been covered".
#
# DELIBERATELY CONSERVATIVE. A missed detection costs one redundant question.
# A false detection loses a piece of information the classifier needed, so
# every list below is a closed set of unambiguous words rather than a clever
# guess, and `other` is never skipped (see `questions_for_round`).
# ---------------------------------------------------------------------------

# Lay anatomy only. A word here answers "where in your body do you feel it".
_BODY_PARTS = frozenset(
    """
    head skull scalp forehead temple face jaw chin cheek
    eye eyes ear ears nose nostril mouth lip lips tongue tooth teeth gum gums
    throat neck shoulder shoulders collarbone
    arm arms elbow elbows forearm wrist wrists hand hands
    finger fingers thumb knuckle palm
    chest breast ribs rib heart lung lungs
    back spine tailbone
    stomach belly abdomen tummy gut side flank
    hip hips groin pelvis buttock bum
    leg legs thigh knee knees calf shin ankle ankles
    foot feet heel toe toes arch
    skin
    """.split()
)

# Time expressions that answer "how long has this been going on".
_DURATION_RE = re.compile(
    r"(?<!\w)("
    r"today|yesterday|tonight|this morning|last night|overnight"
    r"|since\s+\w+"
    r"|for\s+(?:a|an|one|two|three|four|five|six|seven|\d+)\s+"
    r"(?:minute|hour|day|week|month|year)s?"
    r"|(?:a|an|one|two|three|four|five|six|seven|\d+)\s+"
    r"(?:minute|hour|day|week|month|year)s?\s+(?:ago|now)"
    r"|all\s+(?:day|week|month|night)"
    r"|past\s+(?:few\s+)?(?:day|week|month)s?"
    r"|(?:few|couple\s+of)\s+(?:day|week|month)s"
    r")(?!\w)",
    re.IGNORECASE,
)

# Explicit intensity that answers "how bad is it".
_SEVERITY_RE = re.compile(
    r"(?<!\w)("
    r"\d{1,2}\s*(?:/|out\s+of)\s*10"
    r"|mild(?:ly)?|slight(?:ly)?|minor|barely|a\s+bit\s+of"
    r"|moderate(?:ly)?"
    r"|severe(?:ly)?|intense|excruciating|unbearable|agonis(?:ing|ed)|agoniz(?:ing|ed)"
    r"|worst\s+(?:pain|headache|it)"
    r")(?!\w)",
    re.IGNORECASE,
)

_WORD_RE = re.compile(r"[a-z']+")


def answered_by_description(description: str) -> frozenset[str]:
    """
    Which round-one questions the description has already answered.

    Returns question ids. Deterministic and purely lexical — the same text
    always produces the same set, so what the user is asked can be reviewed by
    reading these three tests rather than by running the app.
    """
    if not description or not description.strip():
        return frozenset()

    text = description.lower()
    answered: set[str] = set()

    if any(word in _BODY_PARTS for word in _WORD_RE.findall(text)):
        answered.add("location")

    if _DURATION_RE.search(text):
        answered.add("duration")

    if _SEVERITY_RE.search(text):
        answered.add("severity")

    return frozenset(answered)


def rounds_completed(answers: dict[str, str] | None) -> int:
    """
    How many rounds of questions this submission has already been through.

    Derived from the answer keys rather than trusted from the client, because
    the cap on asking is a safety property and a client must not be able to
    talk its way past it. The two question sets have disjoint ids, so the
    presence of any round-two id is proof that round two has been shown.

    Absence of the field means the first submission; an empty object still
    counts as having been asked once, which is what stops a client that posts
    `{}` from being sent round the same questions again.
    """
    if answers is None:
        return 0
    return 2 if any(key in _ROUND_TWO_IDS for key in answers) else 1


def questions_for_round(
    round_number: int,
    answers: dict[str, str] | None = None,
    description: str = "",
) -> tuple[FollowUpQuestion, ...]:
    """
    The questions to ask for a given round.

    Round one asks the round-one questions the description has NOT already
    answered (see `answered_by_description`). Someone who wrote "my throat has
    been sore since yesterday" is not asked where it is or how long it has
    been going on; someone who wrote "I feel awful" is asked everything, as
    before. Passing no description reproduces the old fixed behaviour exactly.

    Round two is three questions: onset and course are always asked, because
    how something began and which way it is heading are the two things that
    most often turn "feeling off" into something the rules can read. The third
    is chosen by a short chain from round one's answers — deterministic, so
    the same answers always produce the same questions.

    TWO PROPERTIES THAT MUST HOLD, both asserted by tests:

    * **`other` is never skipped.** "Is anything else going on alongside it?"
      is the one question whose answer cannot be inferred from what has
      already been written, and it is the net that catches an associated
      symptom the person did not think to mention. It also guarantees round
      one is never empty, so there is always something to answer.
    * **No round-two id ever appears in round one.** `rounds_completed` reads
      the round off the answer keys precisely because the two sets are
      disjoint, and that is what caps asking server-side. Topping round one up
      from the round-two pool would let a client spend a round without it
      counting.
    """
    if round_number <= 1:
        already = answered_by_description(description)
        return tuple(
            question
            for question in QUESTIONS
            # `other` is deliberately not skippable — see the docstring.
            if question.question_id == "other" or question.question_id not in already
        )

    given = answers or {}
    severity = _severity(given)
    duration = given.get("duration", "").strip().lower()

    if severity is not None and severity >= 8:
        # Severe enough that how much it is disrupting them is the most
        # useful remaining thing to ask.
        third = _IMPACT
    elif duration in {"started today", ""} or not _usable(duration):
        # Brand new, or they could not say — whether it is constant tells us
        # more than anything else at this point.
        third = _PATTERN
    elif duration in {"a week or more", "longer than a month"}:
        # Long-running, so whether it is a recurrence matters.
        third = _PRIOR
    else:
        third = _RECENT

    return (_ONSET, _COURSE, third)


def is_needed(
    *,
    rules_defaulted: bool,
    red_flag_match: bool,
    model_requested_followup: bool = False,
    rounds_asked: int = 0,
    answers: dict[str, str] | None = None,
) -> bool:
    """
    Whether to ask before giving an answer.

    Two things can trigger a question, and either is enough:

    * the rule layer recognised nothing at all (`rules_defaulted`) — the app's
      own statement that it does not understand the description; or
    * the model answered NEEDS_MORE_INFO rather than picking a tier.

    Three things veto it, and any one is enough:

    * a red-flag match. An emergency is never delayed by a questionnaire, no
      matter how little else was understood. This is the most important line
      in this module.
    * having already used every round.
    * the previous round coming back with nothing usable. Someone who skipped
      the questions, or answered "not sure" to all of them, has told us they
      cannot say more; asking again would trap them. The caller takes the safe
      default instead and says so.
    """
    if red_flag_match or rounds_asked >= MAX_ROUNDS:
        return False

    if rounds_asked >= 1 and not any(_usable(v) for v in (answers or {}).values()):
        return False

    return rules_defaulted or model_requested_followup


def merge(description: str, answers: dict[str, str]) -> str:
    """
    Fold the answers back into the description as plain prose.

    Merging rather than storing them separately means the whole text goes
    through emergency screening, the rules, and the topic lookup as one
    description — so an answer carrying a red flag escalates exactly like the
    original text would have.

    ONLY THE ANSWERS ARE MERGED, never the question text. Including the
    prompts looks tidier in the stored record and quietly wrecks the topic
    lookup: "Where in your body do you feel it?" contributes "body", "feel"
    and "going" to the search terms, and a back complaint came back as "How to
    Improve Mental Health". The user's own words are the only ones that should
    be searched.

    Answers are kept in the order the questions are asked rather than the
    order the client sent them, so the same answers always produce the same
    text — the rules and the search are deterministic and should stay that
    way. Unknown ids are ignored so a client cannot inject arbitrary text
    under a made-up key.
    """
    parts = [description.strip()]

    for question in QUESTIONS + ROUND_TWO_QUESTIONS:
        cleaned = answers.get(question.question_id, "").strip()
        if cleaned:
            parts.append(cleaned)

    return ". ".join(part for part in parts if part)


def missing_answers(answers: dict[str, str]) -> list[str]:
    """Ids of questions with no usable answer, in the order they are asked."""
    return [
        question.question_id
        for question in QUESTIONS
        if not answers.get(question.question_id, "").strip()
    ]


# ---------------------------------------------------------------------------
# The recap.
# ---------------------------------------------------------------------------

# One label per question. These are the only words the recap adds, and they
# are deliberately plain: a heading for a field, never a clinical term. There
# is no label here that names a body system, a condition or a symptom class,
# because pairing the user's text with one would be interpreting it.
RECAP_LABELS: dict[str, str] = {
    "location": "Where",
    "duration": "How long",
    "severity": "How bad, out of 10",
    "other": "Alongside it",
    "onset": "How it started",
    "course": "Since it started",
    "pattern": "How often",
    "prior": "Had it before",
    "impact": "Getting in the way",
    "recent": "Anything new",
}


@dataclass(frozen=True)
class RecapEntry:
    label: str
    # The user's own words, verbatim apart from surrounding whitespace.
    value: str


@dataclass(frozen=True)
class Recap:
    understood: list[RecapEntry]
    unclear: list[str]

    def is_empty(self) -> bool:
        return not self.understood and not self.unclear


def asked_questions(answers: dict[str, str]) -> tuple[FollowUpQuestion, ...]:
    """Every question this submission was shown, in the order it was asked."""
    if rounds_completed(answers) >= 2:
        return QUESTIONS + questions_for_round(2, answers)
    return QUESTIONS


def summarise(answers: dict[str, str] | None) -> Recap:
    """
    What the app heard, and what it still does not know.

    This is a receipt, not an interpretation. Each entry is a fixed label
    beside the user's own text; nothing is combined, rephrased, categorised or
    reasoned about, and no condition is ever named. It exists because the
    honest answer to "why did it say urgent again?" is usually "because these
    three things are still blank", and showing that is more use to someone
    than repeating the same sentence.

    Questions answered "I'm not sure" land under `unclear` rather than
    `understood`: reporting a shrug back as a fact would be the one way this
    function could mislead.
    """
    given = answers or {}
    if not given:
        return Recap(understood=[], unclear=[])

    understood: list[RecapEntry] = []
    unclear: list[str] = []

    for question in asked_questions(given):
        label = RECAP_LABELS.get(question.question_id, question.question_id)
        raw = given.get(question.question_id, "").strip()
        if _usable(raw):
            understood.append(RecapEntry(label=label, value=raw))
        else:
            unclear.append(label)

    return Recap(understood=understood, unclear=unclear)
