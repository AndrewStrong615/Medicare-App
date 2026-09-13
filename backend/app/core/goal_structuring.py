"""
Health goals: proposing a plan and a daily schedule, and arranging a person's
own words when a plan cannot be had.

⛔ THIS MODULE AUTHORS HEALTH PLANS. That was not true before 2026-09-12 and
the whole of the reasoning below turns on it, so read this before the rest.

There are two paths and they are not equally guarded.

## `suggest_plan` — the main path, and the one that authors

Given any goal a person types, including a medical one, it proposes the
activities *and* the days and times they sit on. Nothing the person wrote has
to appear in the result.

Until 2026-09-12 this path refused a medical goal outright and screened every
suggestion against `_FORBIDDEN`, a phrase list that discarded a whole plan on
one match. The repository owner asked for both to be removed so that a health
goal is answered with a plan instead of a refusal, and they were.

**So there is no deterministic guard on this path any more.** What constrains
it is `PLAN_SYSTEM_PROMPT`, and a prompt is an instruction that is usually
followed rather than a check that always runs. `_validate_plan` checks shape —
a title, a day list, an "HH:MM" — and no longer looks at content at all. When
weighing a change here, do not reason from the guarantees the second path
offers; this one does not have them.

## `structure` — the fallback, and the one that is checked

Unchanged. It may only rearrange words the person actually wrote: every
activity carries a `source_phrase`, and `_validate` discards the entire draft
unless that phrase occurs in the submitted text. A model that wants to add
stretching to a walking goal has to quote the word "stretch" out of text that
never contained it, and it cannot.

That is the difference between a check and an instruction. The prompt asks;
the check enforces. Four further checks follow the same principle — most
importantly that **no digit may appear in an activity unless the person wrote
it**, because a number nobody asked for is the likely shape of an invented
duration, distance or dose. It is also why a `structure` row carries no clock
time: a time is digits nobody wrote.

These checks are not a complete guard either. A model can still mis-split a
sentence, or attach a real phrase to the wrong activity. They make the one
failure that matters most on this path — inventing an activity outright —
mechanically impossible rather than discouraged.

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

NOT REVIEWED BY A CLINICIAN, and now the only guard on the authoring path.
`PLAN_SYSTEM_PROMPT` is a software engineer's construction and belongs in the
same review as `followup.py` and `dose_schedule.py` — it is the most urgent of
the three, because since 2026-09-12 nothing deterministic backs it up. See
`docs/health-goals-prompt.md`.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any

from app.services import llm
from app.services.llm import LLMRateLimited, LLMUnavailable

logger = logging.getLogger(__name__)

# A goal that splits into more than this was not split, it was written. Eight
# is past anything a person types into one box and well short of a programme.
MAX_ACTIVITIES = 8

CADENCES = {"daily", "times_per_week", "unspecified"}
PREFERRED_TIMES = {"morning", "afternoon", "evening", "unspecified"}

# The days of the week a plan may put an activity on, in the order a week is
# read. Lowercase because that is what the model is asked for and what is
# stored; the screen capitalises for display.
DAYS: tuple[str, ...] = (
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
)

# A scheduled time is a local wall clock "HH:MM", never a UTC instant - the
# same rule as a medication reminder. Eight in the morning means eight in the
# morning wherever the person is, and converting through a timezone would move
# someone's plan the moment they travelled.
_TIME_PATTERN = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")

# Refusal codes. The API maps these to the sentences a person reads; the model
# never writes those.
#
# MEDICAL_GOAL and WOULD_REQUIRE_AUTHORING were removed on 2026-09-12 at the
# repository owner's direct request: the goals section now answers a health
# goal with a plan rather than refusing it. A refusal reason that exists is a
# refusal somebody eventually reads, and "MedHelp can only track activities
# you plan to do" was the dead end this change was asked to remove.
#
# What is left refuses only the two things that are not a goal at all: an
# empty box, and text nobody could read an intention out of.
NO_ACTIVITY_NAMED = "NO_ACTIVITY_NAMED"
UNCLEAR = "UNCLEAR"

REFUSAL_REASONS = {
    NO_ACTIVITY_NAMED,
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
  feel better", "get in shape" describe a destination and no steps. There is
  nothing here to quote, so there is nothing for you to split. Use the reason
  NO_ACTIVITY_NAMED. Somewhere else in the application proposes a plan for a
  goal like that; it is not your job and you must not attempt it here.
- You cannot tell from the text what the activities actually are. Use the
  reason UNCLEAR.

Those are the only two refusals available to you, and the reason is worth
knowing: this step is the fallback that runs when the planner could not
answer, so a refusal here usually leaves the person with an empty editor.
Refuse when you genuinely cannot quote an activity out of what they wrote,
and not otherwise.

Do NOT refuse because the goal is about health. A goal about weight, sleep,
blood pressure, fitness, food or a long-term condition is an ordinary goal
here. If the person named things they intend to do about it, split those
things out in their own words exactly as you would for any other goal.

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
    """
    One trackable thing.

    `source_phrase` is the person's own words this came from, and is None only
    for a suggested activity — see `suggest_plan`. `generated` is carried all
    the way to the screen so a suggestion is always labelled as one; a person
    must never be unable to tell which lines are theirs.

    ## The schedule half

    `days` and `time_of_day` are the concrete daily schedule added on
    2026-09-12: which days of the week this lands on, and the local wall-clock
    time it sits at. They are set by `suggest_plan`, which is proposing a plan
    of its own and may therefore name a time.

    They stay empty on the `structure` path, and that is deliberate rather
    than unfinished. `structure` may only rearrange words the person actually
    wrote, and a clock time it invented would be a quantity nobody stated -
    the same rule that stops it inventing a duration or a distance. A person
    whose own words came back sets their own times on the editor.

    `cadence` and `times_per_week` are *derived* from `days` for a planned
    row rather than being asked for separately, so the two can never disagree.
    """

    text: str
    cadence: str
    preferred_time: str
    source_phrase: str | None = None
    times_per_week: int | None = None
    quantity_text: str | None = None
    generated: bool = False
    # Lowercase members of DAYS, in week order. Empty means no particular day.
    days: tuple[str, ...] = ()
    # Local wall clock "HH:MM", or None for no particular time.
    time_of_day: str | None = None


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


@dataclass(frozen=True)
class Busy:
    """
    The model endpoint was rate limited. Not a refusal, and not an outage.

    ⛔ THIS EXISTS BECAUSE OF A PRODUCTION FAILURE, found on 2026-09-12 by
    running goals against the live deployment. The fifth goal submitted inside
    a minute fast-failed at ~0.6s, and so did every one after it, while the
    same text produced a good plan again a few minutes later. The free-tier
    provider was rate limiting, and every one of those people was told
    "MedHelp has no suggestions right now. You can add your activities below."

    That sentence is wrong twice over. It says the app had nothing to suggest,
    when it had not asked; and it offers the one remedy that does not help,
    when the remedy is to press the button again in a few seconds. Someone
    reasonably concludes the feature does not work for their goal.

    A refusal is a decision about the goal. An outage needs an operator. This
    is neither: it is temporary, it is nobody's mistake, and it fixes itself.
    Telling those three apart is the whole point of the type.

    `retry_after_seconds` is the provider's own `Retry-After` when it sent one.
    """

    retry_after_seconds: int | None = None


def available() -> bool:
    """
    Whether a model endpoint is configured for goals.

    Goals may use a different endpoint from symptom triage — see
    `GOALS_LLM_*` in config. Unset, it is the same one.
    """
    return llm.configured(llm.goals_endpoint())


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
            endpoint=llm.goals_endpoint(),
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


def _discard(check: str) -> None:
    """
    Record which check discarded a draft, and return None for the caller.

    ⛔ THE NAME OF THE CHECK, NEVER THE VALUE THAT FAILED IT. The values here
    are the person's own health text and the model's rendering of it, and
    CLAUDE.md forbids either reaching the application log. A check name is
    about the app, not about anyone.

    WHY IT IS WORTH LOGGING AT ALL: a discarded draft and an unreachable
    endpoint are the same event from outside — an empty editor under "MedHelp
    has no suggestions right now" — and they are opposite problems. One is a
    misconfiguration to repair; the other is the safety net doing its job,
    which is only worth knowing about if it is happening to everybody. Nobody
    could tell which was which, including from a deployment's own logs.
    """
    logger.info("Goal draft discarded by check: %s.", check)
    return None


# ---------------------------------------------------------------------------
# The checks. Every one is a discard, never a repair: a draft that fails is no
# draft. Repairing one would mean deciding what the person meant, which is the
# authoring this module exists to avoid.
# ---------------------------------------------------------------------------


def _validate(arguments: dict[str, Any], description: str) -> GoalDraft | None:
    title = arguments.get("title")
    raw_activities = arguments.get("activities")
    if not isinstance(title, str) or not title.strip():
        return _discard("title missing")
    if not isinstance(raw_activities, list) or not raw_activities:
        return _discard("no activities returned")
    if len(raw_activities) > MAX_ACTIVITIES:
        return _discard(f"more than {MAX_ACTIVITIES} activities")

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
        return _discard("title invents a digit")

    return GoalDraft(title=title.strip(), activities=activities)


def _validate_activity(
    raw: Any, haystack: str, written_digits: set[str]
) -> Activity | None:
    if not isinstance(raw, dict):
        return _discard("activity is not an object")

    text = raw.get("text")
    source_phrase = raw.get("source_phrase")
    cadence = raw.get("cadence")
    preferred_time = raw.get("preferred_time")
    times_per_week = raw.get("times_per_week")
    quantity_text = raw.get("quantity_text")

    if not isinstance(text, str) or not text.strip():
        return _discard("activity text missing")
    if not isinstance(source_phrase, str) or not source_phrase.strip():
        return _discard("source_phrase missing")
    if cadence not in CADENCES or preferred_time not in PREFERRED_TIMES:
        return _discard("cadence or preferred_time not one of the listed values")

    # 1. The person actually wrote this. The whole design rests on this line.
    if _comparable(source_phrase) not in haystack:
        # By far the most common discard, and the one worth counting: the
        # model paraphrased instead of quoting. That is the check working, but
        # if it fires for everybody the prompt needs looking at, not the check.
        return _discard("source_phrase is not in the submitted text")

    # 2. A cadence count exists only where the person stated a cadence, and a
    #    week has seven days.
    if cadence == "times_per_week":
        if not isinstance(times_per_week, int) or not 1 <= times_per_week <= 7:
            return _discard("times_per_week is not 1-7")
    elif times_per_week is not None:
        return _discard("times_per_week set without a times_per_week cadence")

    # 3. A quantity is a quoted thing, like the phrase it came from.
    if quantity_text is not None:
        if not isinstance(quantity_text, str) or not quantity_text.strip():
            return _discard("quantity_text is empty")
        if _comparable(quantity_text) not in haystack:
            return _discard("quantity_text is not in the submitted text")

    # 4. No digit the person did not write. An invented number is the likely
    #    shape of an invented duration, distance or dose.
    if _invents_a_digit(text, written_digits):
        return _discard("activity invents a digit")

    return Activity(
        text=text.strip(),
        source_phrase=source_phrase.strip(),
        cadence=cadence,
        preferred_time=preferred_time,
        times_per_week=times_per_week if cadence == "times_per_week" else None,
        quantity_text=quantity_text.strip() if quantity_text else None,
    )


# ---------------------------------------------------------------------------
# Proposing the plan, and the daily schedule that goes with it.
#
# ⛔ THIS IS WHERE MEDHELP AUTHORS CONTENT NOBODY WROTE. It runs for every goal
# a person types, including a medical one, and it proposes both the activities
# and the days and times they sit on.
#
# ## What changed on 2026-09-12, and what it cost
#
# This path used to refuse a medical goal outright (the MEDICAL_GOAL code) and
# ran every suggestion past `_FORBIDDEN`, a phrase list that discarded a whole
# plan on one match — so "lose weight" or "get my blood pressure down" reached
# the person as a refusal rather than a plan. The repository owner asked
# directly, on 2026-09-12, for both to go and for the section to answer any
# health goal with a plan and a daily schedule.
#
# Both are gone. Be clear-eyed about what that means rather than reassured by
# what is left: the deterministic guard is removed, and the prompt below is now
# the ONLY thing standing between a model and an app-authored health plan for a
# named condition. A prompt is an instruction that is usually followed; a
# phrase list was a check that always ran. This is a materially weaker position
# and it was chosen deliberately.
#
# ## What still holds
#
# 1. **Every suggestion is labelled and confirmed.** `generated=True` reaches
#    the screen, the row says MedHelp suggested it, and nothing is saved until
#    the person edits and presses save. The review pass is the person.
# 2. **Nothing is a claim.** The prompt still forbids saying what an activity
#    will do for someone — propose the activity, not the benefit — because a
#    benefit claim is the app making a health claim about a named condition.
# 3. **Emergency screening still runs first**, in `api/goals.py`, before this
#    is ever called. That is untouched and must stay untouched.
# 4. **The `structure` fallback is unchanged.** Where this path fails, the
#    person's own quoted words still come back rather than an empty editor.
#
# ⛔ NOT CLINICALLY REVIEWED, AND NOW CARRYING MORE WEIGHT THAN EVER. Nobody
# qualified has read `PLAN_SYSTEM_PROMPT`, and it is now the whole of the
# guard. This is the most urgent item in the outstanding clinical review — see
# `docs/health-goals-prompt.md` and CLAUDE.md.
# ---------------------------------------------------------------------------

# A plan stays small. A long list reads as a prescription, and nobody starting
# out keeps to fifteen new habits.
MAX_SUGGESTED = 5

PLAN_SYSTEM_PROMPT = """\
You are proposing a plan inside a health application. A person has written
down a goal, and your job is to turn it into something they can actually do:
a few small everyday activities, and a daily schedule saying which days of the
week each one happens and at what time.

This is your plan, not a re-reading of their sentence. If they already named
some activities you may keep the ones that fit, but do not simply hand their
own words back as a list - propose the plan you would actually suggest to
someone starting out. They edit every row before anything is saved.

ANY GOAL GETS A PLAN

Plan for the goal they actually wrote, including a health one. Weight, sleep,
fitness, food, stress, energy, a long-term condition, a measurement their
doctor mentioned - these are ordinary goals here and each gets a practical
plan of everyday activities. Do not refuse a goal for being about health, and
do not quietly answer a different, safer goal than the one they wrote.

THE DAILY SCHEDULE

Every activity needs `days` and `time_of_day`. This is the part the person
came for: a plan with no schedule is a list.

- `days` is a list of day names from: monday, tuesday, wednesday, thursday,
  friday, saturday, sunday. Give every day the activity happens on. All seven
  for something daily.
- `time_of_day` is a 24-hour local clock time, "HH:MM" - "07:30", "13:00",
  "21:15". Pick an hour the activity plausibly fits: a walk after lunch is
  early afternoon, winding down is late evening, stretching on waking is
  early morning.
- Spread the week out and stagger the times. Two or three things on a steady
  rhythm at sensible hours is a better plan than five things every day at
  09:00, which nobody keeps up.
- Waking hours only, and keep them ordinary: nothing before 06:00 or after
  22:00 unless the goal is itself about sleep or shift work.

Do not set `cadence` or `times_per_week`. The application works those out
from the days you give, so they can never disagree with the schedule.

WHAT TO PROPOSE

- Between two and five small, ordinary, everyday activities.
- Things a person can do without equipment, a gym, a subscription or money.
- Plain movement, rest, routine, food habits, time outdoors, time with
  people, and simple daily habits.
- Modest starting points, not a training programme. Assume the person is
  starting from nothing and has little spare time.
- Write each one as a short plain instruction: "Walk after lunch", "Go to bed
  at the same time each night", "Cook dinner at home".
- You may give a small, gentle amount of time where it helps - "ten minutes",
  "a short walk". Keep it easy.

WHAT YOU MUST NEVER PROPOSE

These are absolute, and they are about what only a clinician may decide. If a
goal cannot be answered without one of these, propose the everyday activities
around it instead and leave the clinical part alone.

- A medication, a dose, a supplement, or any change to something prescribed -
  including starting, stopping, splitting or skipping one. If a goal is about
  medication, the most you may propose is a routine for taking it as already
  prescribed, and never a change to what that is.
- A target number for a clinical measurement: a weight to reach, a blood
  pressure, a blood sugar, a cholesterol figure, a calorie target.
- Anything presented as treating, curing or managing a diagnosed illness or
  injury, or as a substitute for seeing someone about it.
- Intense, strenuous or competitive exercise, training to exhaustion, or
  continuing through pain of any kind.
- Fasting, purging, detoxes, cleanses, skipping meals, or cutting out a food
  group entirely.
- Any claim about what an activity will do for the person's health, body or
  illness. Propose the activity and stop. No benefits, no reasons, no
  promises, no mechanisms. "Walk after lunch" - not "walk after lunch to
  bring your blood sugar down".

The last one matters most and is the easiest to break. A plan that only
proposes activities is a plan; the moment it explains what those activities
will do to a person's illness, it has become advice nobody qualified wrote.

THE TITLE IS HELD TO THE SAME RULE, AND TO ONE MORE

Two rules. They pull in opposite directions, and a good title satisfies both.

1. NO CLINICAL RESULT. The title must not name an outcome the plan is
   supposed to produce. Never "Headache relief routine",
   "Blood pressure support routine", "Cholesterol reduction plan" or
   "Migraine fix". Words like relief, support, reduction, management,
   treatment and improvement attach a clinical function to the plan, and the
   plan does not have one.

2. NO CATEGORY LABEL. The title must be specific to the plan you just wrote.
   A title that would sit equally well on somebody else's plan is not a title,
   it is a heading for the whole feature. Never "Daily routine", "Daily
   habits", "Healthy habits", "Wellbeing plan", "Movement and meals", "Health
   plan", or anything else you could put on top of any plan in this
   application without reading it.

Build the title out of the activities you actually proposed and the part of
the day they sit in - "Walks and early nights", "Cooking and evening walks",
"Screens off by nine", "Breathing breaks at the desk", "Mornings outdoors".
Someone with three saved goals sees three titles in a list and has to be able
to tell which is which; if two of your titles could be swapped without anyone
noticing, both are wrong.

A person reads the title first and it is the part they will repeat to
themselves. It is the last place to be loose about either rule.

WHEN TO REFUSE

Refusing is a last resort here, not a safe default. The person came for a
plan, and an empty screen is the worst answer available. Call
cannot_structure instead of suggest_plan only when:

- The box is empty, or there is no goal in it at all. Use the reason
  NO_ACTIVITY_NAMED.
- You genuinely cannot tell what the person is going for. Use UNCLEAR.

There is no refusal code for "this goal is about health". That is not a
reason to refuse.\
"""

SUGGEST_PLAN = {
    "type": "function",
    "function": {
        "name": "suggest_plan",
        "description": (
            "Propose a few small everyday activities, each on named days of "
            "the week at a named time, which the person will edit before "
            "anything is saved."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Short plain title for the goal.",
                },
                "activities": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "text": {
                                "type": "string",
                                "description": "Short plain instruction.",
                            },
                            # ⛔ The schedule replaced `cadence` /
                            # `times_per_week` as model input on 2026-09-12.
                            # Those two are still stored, but they are now
                            # DERIVED from `days` in `_validate_plan` rather
                            # than asked for, so a plan cannot come back
                            # saying "three times a week" beside four days.
                            # It also removes the failure that discarded a
                            # whole plan when a model picked the weekly
                            # cadence and forgot the count.
                            "days": {
                                "type": "array",
                                "items": {"type": "string", "enum": list(DAYS)},
                                "minItems": 1,
                                "maxItems": 7,
                                "description": (
                                    "Every day of the week this happens on. "
                                    "All seven for a daily activity."
                                ),
                            },
                            "time_of_day": {
                                "type": "string",
                                "description": (
                                    "Local 24-hour clock time, 'HH:MM', e.g. "
                                    "'07:30' or '18:00'."
                                ),
                            },
                        },
                        "required": ["text", "days", "time_of_day"],
                        "additionalProperties": False,
                    },
                },
            },
            "required": ["title", "activities"],
            "additionalProperties": False,
        },
    },
}


# ⛔ `_FORBIDDEN` AND `mentions_forbidden` WERE REMOVED ON 2026-09-12.
#
# They were a phrase list — "calorie", "weight", "blood pressure", "dose",
# "hiit" and about sixty more — and one match anywhere in a plan discarded the
# whole plan. That is what made "help me lose weight" unanswerable: the goal
# could not be planned for without using the words the veto was watching for.
#
# The repository owner asked for that blocking gone, so it is gone rather than
# loosened. Two things follow, and both are worth knowing before anyone
# reinstates a check here:
#
# - **There is no deterministic guard on a suggested plan any more.** The only
#   constraint is `PLAN_SYSTEM_PROMPT`, which is an instruction rather than a
#   check. A phrase list failed closed; a prompt fails open and silently.
# - **Reinstating a narrower list is the cheapest safety work available in
#   this feature**, and the clinical reviewer should be asked what belongs on
#   it. It is deliberately not being guessed at here.
#
# What did NOT change: a plan is still labelled `generated`, still edited and
# confirmed by the person before it is saved, and emergency screening in
# `api/goals.py` still runs before this module is called at all.


def suggest_plan(description: str) -> GoalDraft | Refusal | Busy | None:
    """
    Propose an original plan, and a weekly rhythm for it, for a stated goal.

    This runs for every goal, medical ones included - the repository owner
    asked on 2026-09-09 for the app to propose its own plan rather than split
    the person's sentence into rows, and on 2026-09-12 for the refusal that
    held health goals back to be removed. `structure` still exists and is
    still the fallback: where a plan cannot be had, the person's own words are
    better than an empty editor.

    Every activity comes back with `days` and `time_of_day` set, so what
    reaches the screen is a plan with a daily schedule rather than a list.

    Everything it returns is `generated=True`, so every row reaches the screen
    carrying "Suggested by MedHelp - edit it or remove it". That label is what
    keeps an originated plan distinguishable from the person's own writing, and
    it may not be dropped.

    Returns None for every failure, exactly as `structure` does: the person
    gets an empty editor rather than a plan MedHelp made up while broken.
    """
    if not description.strip():
        return Refusal(NO_ACTIVITY_NAMED)
    if not available():
        return _discard("planner: no goals endpoint is configured")

    try:
        reply = llm.chat(
            messages=[
                {"role": "system", "content": PLAN_SYSTEM_PROMPT},
                {"role": "user", "content": description},
            ],
            tools=[SUGGEST_PLAN, CANNOT_STRUCTURE],
            endpoint=llm.goals_endpoint(),
            # Absorb the burst a real person makes. See `Busy` above and the
            # note on `llm.chat`: a 429 is the one model failure that fixes
            # itself, and this is the path with no rule layer underneath it.
            retry_on_rate_limit=2,
        )
    except LLMRateLimited as exc:
        # Distinguished from every other failure so the person is told to try
        # again rather than that MedHelp had nothing to suggest.
        logger.info("Goal planner was rate limited.")
        return Busy(exc.retry_after_seconds)
    except LLMUnavailable:
        # `llm.chat` has already logged the status code and, where it is one it
        # recognises, the provider's own error code. Naming the caller is what
        # tells an operator which of the two model calls in this request failed.
        return _discard("planner: the endpoint was unreachable")

    if not reply.tool_calls:
        # The likeliest failure once a key is working, and previously the most
        # invisible: the model answered in prose instead of calling a tool.
        # Every path here returns the same empty editor, so without this line an
        # operator cannot tell a chatty model from a revoked key.
        return _discard("planner: the model answered without calling a tool")

    call = reply.tool_calls[0]
    if call.name == "cannot_structure":
        reason = call.arguments.get("reason")
        logger.info("Goal planner declined, reason: %s.", reason)
        return Refusal(reason) if reason in REFUSAL_REASONS else Refusal(UNCLEAR)
    if call.name != "suggest_plan":
        return _discard("planner: the model called a tool that was not offered")

    return _validate_plan(call.arguments)


def _normalise_days(raw: Any) -> tuple[str, ...] | None:
    """
    The days a planned activity lands on, deduplicated and in week order.

    Returns None when the value is not a usable list of day names. Week order
    is imposed here rather than trusted from the model, so "sunday, monday"
    and "monday, sunday" are the same schedule and read the same on screen.
    """
    if not isinstance(raw, list) or not raw:
        return None
    named = {
        value.strip().lower()
        for value in raw
        if isinstance(value, str) and value.strip().lower() in DAYS
    }
    if not named or len(named) != len({v.strip().lower() for v in raw if isinstance(v, str)}):
        # An unrecognised day name means the model was working from a
        # vocabulary that is not ours, and guessing which day it meant would
        # put an activity on the wrong day of someone's week.
        return None
    return tuple(day for day in DAYS if day in named)


def _normalise_time(raw: Any) -> str | None:
    """
    A local wall-clock "HH:MM", or None if it is not one.

    Deliberately strict: "8am", "0800" and "8:00" are refused rather than
    guessed, exactly as `services/dose_schedule.py` refuses them, and for the
    same reason - "8" could be either end of the day and an activity put at
    the wrong one is worse than an activity with no time on it.
    """
    if not isinstance(raw, str):
        return None
    value = raw.strip()
    return value if _TIME_PATTERN.match(value) else None


def _bucket(time_of_day: str | None) -> str:
    """
    The coarse `preferred_time` that goes with a clock time.

    Derived rather than asked for, so the two can never contradict each other
    on screen. The boundaries are the ordinary English ones and carry no
    clinical meaning.
    """
    if time_of_day is None:
        return "unspecified"
    hour = int(time_of_day[:2])
    if hour < 12:
        return "morning"
    if hour < 17:
        return "afternoon"
    return "evening"


def _validate_plan(arguments: dict[str, Any]) -> GoalDraft | None:
    """
    Check a suggested plan and derive its cadence from its schedule.

    ⛔ THIS NO LONGER VETOES ON CONTENT. The `_FORBIDDEN` phrase list that used
    to discard a whole plan on one match was removed on 2026-09-12 — see the
    note above it. What is left checks shape only: that there is a title, that
    there are not too many rows, and that every row carries a schedule this
    app can actually render.

    A row without a usable day list or a usable "HH:MM" discards the whole
    plan rather than being kept with a blank schedule. A plan the person asked
    for and cannot see the timing of is not the thing they asked for, and a
    silently half-scheduled plan is harder to notice than an absent one.
    """
    title = arguments.get("title")
    raw_activities = arguments.get("activities")
    if not isinstance(title, str) or not title.strip():
        return _discard("plan: no usable title")
    if not isinstance(raw_activities, list) or not raw_activities:
        return _discard("plan: no activities")
    if len(raw_activities) > MAX_SUGGESTED:
        return _discard("plan: more activities than MAX_SUGGESTED")

    activities: list[Activity] = []
    for raw in raw_activities:
        if not isinstance(raw, dict):
            return _discard("plan: an activity was not an object")
        text = raw.get("text")
        if not isinstance(text, str) or not text.strip():
            return _discard("plan: an activity had no text")

        days = _normalise_days(raw.get("days"))
        if days is None:
            return _discard("plan: an activity had no usable list of days")
        time_of_day = _normalise_time(raw.get("time_of_day"))
        if time_of_day is None:
            return _discard("plan: an activity had no usable HH:MM time")

        # Derived, never asked for: a plan cannot say "three times a week"
        # beside four days, because nothing separately reports the count.
        cadence = "daily" if len(days) == len(DAYS) else "times_per_week"

        activities.append(
            Activity(
                text=text.strip(),
                cadence=cadence,
                preferred_time=_bucket(time_of_day),
                source_phrase=None,
                times_per_week=None if cadence == "daily" else len(days),
                generated=True,
                days=days,
                time_of_day=time_of_day,
            )
        )

    return GoalDraft(title=title.strip(), activities=activities)


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
