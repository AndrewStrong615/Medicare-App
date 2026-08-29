"""
Follow-up prompts for descriptions the app could not make sense of.

WHY THIS EXISTS: "I've been feeling off since this morning" matches no rule
and no health topic, so it produced a default tier and an empty screen. The
fix is to ask for more, the way any intake process does.

WHAT THESE QUESTIONS ARE: neutral elicitation. They ask the person to say
more about what they already said — where it is, how long, what else. They
are the questions a receptionist asks, not the ones a clinician asks.

WHAT THEY ARE DELIBERATELY NOT: clinical screening. There is no "does the
pain radiate to your arm", no "is the rash blanching", nothing that encodes a
threshold or tests a hypothesis. Those are clinical judgements, and CLAUDE.md
does not permit this app to author them. Every question below is fixed,
readable in one sitting, and identical for every user and every complaint —
which is what makes it reviewable, and what keeps it short of practising.

Two rules hold and are asserted by tests:

1. **A red-flag description is never asked anything.** Emergency screening
   runs first and routes straight to emergency guidance. Standing between
   someone describing chest pain and the dial button to ask how long it has
   been going on would be the worst thing this module could do.

2. **The answers are re-screened.** They are merged into the description and
   the whole thing goes through `assess` again from the top, so a red flag
   that first appears in an answer still escalates. Answers are not trusted
   to be less serious than the original text.

NOT CLINICALLY REVIEWED. Like everything else in intake, these prompts were
written by a software engineer and are covered by the blocking sign-off in
CLAUDE.md.
"""

from __future__ import annotations

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
        question_id="other",
        prompt="Is anything else going on alongside it?",
        kind="text",
        helper="Anything you noticed at the same time, or \"nothing else\".",
    ),
)

INTRO = (
    "MedHelp couldn't tell what you're describing well enough to be useful. "
    "A few more details will help — and you can call 911 at any point without "
    "answering these."
)


def is_needed(*, rules_defaulted: bool, red_flag_match: bool) -> bool:
    """
    Whether to ask before giving an answer.

    Only when the rule layer recognised nothing at all — that flag is the
    app's own statement that it does not understand the description, which is
    exactly the condition worth asking about. A red-flag match short-circuits
    to False no matter what else is true: an emergency is never delayed by a
    questionnaire.
    """
    if red_flag_match:
        return False
    return rules_defaulted


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

    for question in QUESTIONS:
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
