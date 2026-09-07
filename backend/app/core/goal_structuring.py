"""
Health goals: arranging a person's own words into a schedule the app can track.

⛔ THE MODEL DOES NOT AUTHOR ANY OF THIS. CLAUDE.md's rule is that the app never
authors medical content — it is why MedlinePlus text is rendered verbatim and
why `labelParser.ts` copies a sig line across without expanding `BID`. A model
that decides someone should walk three times a week, drink more water and wind
down before bed has authored health advice, however sensible each line reads.

So the model is given the one job that is not authoring: splitting text the
person already wrote into individually trackable activities. It supplies form;
the person supplies content. Same line `services/search_terms.py` walks.

## The property that is checked rather than trusted

Every activity carries a `source_phrase`, and `_validate` discards the entire
draft unless that phrase occurs in the text the person submitted. A model that
wants to add stretching to a walking goal has to quote the word "stretch" out
of text that never contained it, and it cannot.

That is the difference between this and a prompt instruction. The prompt asks;
the check enforces. Four further checks follow the same principle — most
importantly that **no digit may appear in an activity unless the person wrote
it**, because a number nobody asked for is the likely shape of an invented
duration, distance or dose.

The checks are not a complete guard. A model can still mis-split a sentence, or
attach a real phrase to the wrong activity. They make the one failure that
matters most — inventing an activity outright — mechanically impossible rather
than discouraged.

## Failure is never a plan

`LLMUnavailable`, an unparseable answer, or any failed check yields None, and
the caller offers the person the same editor with nothing filled in. There is
no generated fallback, for the same reason a model outage in triage is never
SELF_CARE: a health app that invents something when it is broken is worse than
one that admits it has nothing.

## What this module never does

It is never the emergency screen. `api/goals.py` runs `screen_for_emergency`
over the text before calling here, deterministically, because a goal box takes
"stop feeling dizzy on the stairs" as readily as intake does and emergency
guidance must not wait on a vendor.

Nothing here is user-facing copy either. A refusal comes back as a code and the
API owns the sentence, for the same reason `emergency.py` owns its guidance
text: what a person reads in a health app is reviewed text.

NOT REVIEWED BY A CLINICIAN. The prompt and the refusal list are a software
engineer's construction and belong in the same review as `followup.py` and
`dose_schedule.py`. See `docs/health-goals-prompt.md`.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any

from app.services import llm
from app.services.llm import LLMUnavailable

logger = logging.getLogger(__name__)

# A goal that splits into more than this was not split, it was written. Eight
# is past anything a person types into one box and well short of a programme.
MAX_ACTIVITIES = 8

CADENCES = {"daily", "times_per_week", "unspecified"}
PREFERRED_TIMES = {"morning", "afternoon", "evening", "unspecified"}

# Refusal codes. The API maps these to the sentences a person reads; the model
# never writes those.
NO_ACTIVITY_NAMED = "NO_ACTIVITY_NAMED"
MEDICAL_GOAL = "MEDICAL_GOAL"
WOULD_REQUIRE_AUTHORING = "WOULD_REQUIRE_AUTHORING"
UNCLEAR = "UNCLEAR"

REFUSAL_REASONS = {
    NO_ACTIVITY_NAMED,
    MEDICAL_GOAL,
    WOULD_REQUIRE_AUTHORING,
    UNCLEAR,
}


SYSTEM_PROMPT = """\
You are a structuring step inside a health application. You do not give
health advice, and nothing you write is read as advice.

A person has written down a goal and the things they intend to do about it.
Your only job is to arrange THEIR OWN WORDS into a schedule the application
can track. You are not a coach, a planner or a clinician.

WHAT YOU MAY DO

- Split what the person wrote into separate activities that can be tracked
  one at a time.
- Carry each activity across in the person's own words. You may trim filler,
  fix capitalisation, and turn it into a plain instruction - "I want to try
  walking in the mornings" becomes "Walk in the mornings". Never substitute a
  different activity word for the one they used.
- Give each activity the cadence the person stated: every day, three times a
  week, at the weekend. If they stated no cadence, leave it unset.
- Carry across any quantity they stated, exactly as they wrote it: a
  duration, a count, a distance, a time of day.
- Suggest a short, plain title for the goal, drawn from their own words.

WHAT YOU MUST NOT DO

These are hard constraints. If following one means returning less, return
less.

- Never add an activity the person did not name. If they wrote "walk more",
  you do not add stretching, hydration, sleep routines, journalling or
  anything else, however helpful it would be.
- Never set a quantity they did not state. No durations, distances, counts,
  repetitions, weights, calorie figures, hours of sleep or heart rates of
  your own.
- Never increase a quantity over time. Whether to progress, and by how much,
  is the person's decision and not yours.
- Never explain why an activity is good for them, what it does to the body,
  or what result to expect from it. No benefits, no mechanisms, no promises.
- Never name, imply, suggest or rule out any medical condition, symptom,
  medication or treatment.
- Never comment on the person's body, weight, size, shape or appearance, and
  never turn what they wrote into a goal about any of those.
- Never restrict food, design a diet, set a calorie target, or schedule
  fasting or skipped meals.
- Never tell the person to push through pain, or to exercise, eat or sleep in
  any way they did not themselves describe.
- Do not judge whether the goal is realistic, healthy, safe or a good idea.
  The application is not asking you that, and it is not your call.

EVIDENCE FOR EVERY ACTIVITY

Each activity you return must carry a source_phrase: an exact, unmodified run
of characters copied from what the person wrote, being the part of their text
that activity came from. Copy it character for character. The application
checks it against the original and discards your entire answer if it does not
match, so an activity you cannot quote is one you must not return.

WHEN TO REFUSE

Call cannot_structure - do not call structure_goal - when:

- The person named no activity at all. "I want to be healthier", "help me
  feel better", "get in shape" describe a destination and no steps.
  Structuring this would mean inventing the plan.
- What they wrote is about a symptom, an illness, an injury, a medication, or
  a change to their body rather than about something they intend to do.
  "Stop my headaches", "lose 20 pounds", "come off my blood pressure
  tablets", "stop feeling dizzy" are all refusals.
- They are asking you for a diet, a calorie target, a training programme, or
  anything else you would have to author.
- You cannot tell from the text what the activities actually are.

Refusing is always available and is always the right answer when you are
unsure. A refusal costs the person one screen on which they type their own
activities. An invented plan puts words into a health application's mouth
that no one has reviewed.

Give the reason code only. The application writes what the person reads; do
not write a message to them yourself.\
"""


STRUCTURE_GOAL = {
    "type": "function",
    "function": {
        "name": "structure_goal",
        "description": (
            "Return the person's own stated activities, arranged into a "
            "trackable schedule. Every activity must quote their text."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Short plain title drawn from their words.",
                },
                "activities": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "text": {
                                "type": "string",
                                "description": (
                                    "The activity as a plain instruction, in "
                                    "their words."
                                ),
                            },
                            "source_phrase": {
                                "type": "string",
                                "description": (
                                    "Exact substring of the submitted text "
                                    "this activity came from."
                                ),
                            },
                            "cadence": {
                                "type": "string",
                                "enum": sorted(CADENCES),
                            },
                            "times_per_week": {
                                "type": ["integer", "null"],
                                "description": (
                                    "Only if the person stated it. Otherwise "
                                    "null."
                                ),
                            },
                            "quantity_text": {
                                "type": ["string", "null"],
                                "description": (
                                    "Verbatim quantity they stated, e.g. "
                                    "'20 minutes'. Otherwise null."
                                ),
                            },
                            "preferred_time": {
                                "type": "string",
                                "enum": sorted(PREFERRED_TIMES),
                            },
                        },
                        "required": [
                            "text",
                            "source_phrase",
                            "cadence",
                            "preferred_time",
                        ],
                        "additionalProperties": False,
                    },
                },
            },
            "required": ["title", "activities"],
            "additionalProperties": False,
        },
    },
}

CANNOT_STRUCTURE = {
    "type": "function",
    "function": {
        "name": "cannot_structure",
        "description": "Decline. Always available, and correct whenever unsure.",
        "parameters": {
            "type": "object",
            "properties": {
                "reason": {
                    "type": "string",
                    "enum": sorted(REFUSAL_REASONS),
                }
            },
            "required": ["reason"],
            "additionalProperties": False,
        },
    },
}


@dataclass(frozen=True)
class Activity:
    """One trackable thing, in the person's own words."""

    text: str
    source_phrase: str
    cadence: str
    preferred_time: str
    times_per_week: int | None = None
    quantity_text: str | None = None


@dataclass(frozen=True)
class GoalDraft:
    """
    A proposal, never a saved goal.

    Nothing is written and no notification is armed until the person edits
    this on screen and presses save - the same read-then-confirm shape as
    `services/dose_schedule.py`.
    """

    title: str
    activities: list[Activity]


@dataclass(frozen=True)
class Refusal:
    """The model declined. `reason` is a code; the API owns the wording."""

    reason: str


def available() -> bool:
    """Whether a model endpoint is configured at all."""
    return llm.configured()


def structure(description: str) -> GoalDraft | Refusal | None:
    """
    Ask the model to split `description` into trackable activities.

    Returns None for every failure - no endpoint, an outage, an unparseable
    answer, or an answer that failed a check. The caller offers an empty
    editor; it never substitutes a plan of its own.
    """
    if not description.strip():
        return Refusal(NO_ACTIVITY_NAMED)
    if not available():
        return None

    try:
        reply = llm.chat(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": description},
            ],
            tools=[STRUCTURE_GOAL, CANNOT_STRUCTURE],
        )
    except LLMUnavailable:
        # Already logged by the client, without the body. Nothing about the
        # person's text reaches this log either.
        return None

    if not reply.tool_calls:
        return None

    call = reply.tool_calls[0]
    if call.name == "cannot_structure":
        reason = call.arguments.get("reason")
        return Refusal(reason) if reason in REFUSAL_REASONS else Refusal(UNCLEAR)
    if call.name != "structure_goal":
        return None

    return _validate(call.arguments, description)


# ---------------------------------------------------------------------------
# The checks. Every one is a discard, never a repair: a draft that fails is no
# draft. Repairing one would mean deciding what the person meant, which is the
# authoring this module exists to avoid.
# ---------------------------------------------------------------------------


def _validate(arguments: dict[str, Any], description: str) -> GoalDraft | None:
    title = arguments.get("title")
    raw_activities = arguments.get("activities")
    if not isinstance(title, str) or not title.strip():
        return None
    if not isinstance(raw_activities, list) or not raw_activities:
        return None
    if len(raw_activities) > MAX_ACTIVITIES:
        return None

    haystack = _comparable(description)
    written_digits = set(re.findall(r"\d", description))

    activities: list[Activity] = []
    for raw in raw_activities:
        activity = _validate_activity(raw, haystack, written_digits)
        if activity is None:
            return None
        activities.append(activity)

    # The title is shown to the person, so it is held to the digit rule too.
    if _invents_a_digit(title, written_digits):
        return None

    return GoalDraft(title=title.strip(), activities=activities)


def _validate_activity(
    raw: Any, haystack: str, written_digits: set[str]
) -> Activity | None:
    if not isinstance(raw, dict):
        return None

    text = raw.get("text")
    source_phrase = raw.get("source_phrase")
    cadence = raw.get("cadence")
    preferred_time = raw.get("preferred_time")
    times_per_week = raw.get("times_per_week")
    quantity_text = raw.get("quantity_text")

    if not isinstance(text, str) or not text.strip():
        return None
    if not isinstance(source_phrase, str) or not source_phrase.strip():
        return None
    if cadence not in CADENCES or preferred_time not in PREFERRED_TIMES:
        return None

    # 1. The person actually wrote this. The whole design rests on this line.
    if _comparable(source_phrase) not in haystack:
        return None

    # 2. A cadence count exists only where the person stated a cadence, and a
    #    week has seven days.
    if cadence == "times_per_week":
        if not isinstance(times_per_week, int) or not 1 <= times_per_week <= 7:
            return None
    elif times_per_week is not None:
        return None

    # 3. A quantity is a quoted thing, like the phrase it came from.
    if quantity_text is not None:
        if not isinstance(quantity_text, str) or not quantity_text.strip():
            return None
        if _comparable(quantity_text) not in haystack:
            return None

    # 4. No digit the person did not write. An invented number is the likely
    #    shape of an invented duration, distance or dose.
    if _invents_a_digit(text, written_digits):
        return None

    return Activity(
        text=text.strip(),
        source_phrase=source_phrase.strip(),
        cadence=cadence,
        preferred_time=preferred_time,
        times_per_week=times_per_week if cadence == "times_per_week" else None,
        quantity_text=quantity_text.strip() if quantity_text else None,
    )


def _comparable(value: str) -> str:
    """
    Fold case and collapse whitespace before comparing.

    The prompt asks for a character-for-character copy, but a model that
    lowercases a phrase or turns a line break into a space has still quoted the
    person rather than invented anything - and rejecting that costs a real
    draft for no safety gain. Folding case cannot let an unwritten activity
    through: the words still have to be there.
    """
    return re.sub(r"\s+", " ", value).strip().lower()


def _invents_a_digit(value: str, written_digits: set[str]) -> bool:
    """True if `value` contains a digit the person did not write."""
    return any(digit not in written_digits for digit in re.findall(r"\d", value))
