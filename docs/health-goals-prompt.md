# Health goals: the planning prompt

**Status: nothing here is wired.** No endpoint calls it, no screen renders it,
no table stores it. This is the prompt and its contract, written down so a
reviewer can read the instrument before it exists.

⛔ **Building on this needs approval, in two parts.** CLAUDE.md fences clinical
content; a person must approve the feature by name, the same way the
`normalize_query` fix and `deduction.py` were approved. Separately, the copy
and the refusal list below belong in the same clinician read as `followup.py`
and `dose_schedule.py`.

---

## The rule this is built around

> The app never authors medical content.
> — CLAUDE.md, *Medical content: where it comes from*

That rule is why symptom text is fetched verbatim from MedlinePlus rather than
summarised, and why `labelParser.ts` copies a sig line across without expanding
`BID`. It applies here unchanged. A model that decides a person should walk
three times a week, drink more water and wind down before bed has authored
health advice, no matter how sensible each line is.

So the model is given the one job that is not authoring: **arranging words the
person already wrote into a shape the app can track.** It is the same line
`search_terms.py` walks — the model chooses form, the person supplies content.

| The model may | The model may not |
|---|---|
| Split what the person wrote into separate trackable activities | Add an activity they did not name |
| Carry a stated quantity across verbatim ("20 minutes", "3 times") | Invent a quantity, or increase one over time |
| Assign a cadence the person stated | Assign a cadence they did not state |
| Title the goal in their words | Explain why anything is good for them |
| Refuse | Name a condition, symptom, medication or body change |

## Where the call sits

The prompt is the third step, and never the first.

1. **The app screens the goal text** with `screen_for_emergency`
   (`app/core/emergency.py`), deterministically, before any model call. A goal
   box is a free-text health input like any other in this app — "stop feeling
   dizzy on the stairs" is typed into one as readily as into intake — and
   emergency guidance is the one thing that must never wait on a vendor.
2. **The app checks the refusal cases it can decide itself**: empty input,
   input with no verb, input longer than the field allows.
3. **`llm.chat(messages=..., tools=[STRUCTURE_GOAL, CANNOT_STRUCTURE])`** at
   `temperature=0`, one round trip, through the existing client.
4. **The app validates the tool call** — including the substring check below —
   and discards anything that fails.
5. **The result is rendered as an editable draft.** Nothing is saved, and no
   notification is armed, until the person presses save. Same shape as
   `ReminderEditScreen`: MedHelp proposes, the person decides.

`LLMUnavailable` means **no draft**, and the person types their own activities
into the same editor. There is no generated fallback plan — the rule that
failure is never the reassuring answer applies here too.

## The property that is checked rather than trusted

Every activity the model returns carries a **`source_phrase`: a literal
substring of what the person typed.** The app rejects the whole draft if any
`source_phrase` is not found verbatim in the submitted text.

This is the part that makes "the model did not invent this" an assertion
instead of a hope. A model that wants to add stretching to a walking goal has
to produce a `source_phrase` containing "stretch", and it cannot, because the
person never wrote it. Prompt instructions are guidance; this is a check.

It is not a complete guard — a model can still mis-split a sentence or attach a
real phrase to the wrong activity — but it makes the specific failure that
matters most here, adding an activity out of thin air, mechanically impossible
rather than merely discouraged.

---

## The system prompt

```
You are a structuring step inside a health application. You do not give
health advice, and nothing you write is read as advice.

A person has written down a goal and the things they intend to do about it.
Your only job is to arrange THEIR OWN WORDS into a schedule the application
can track. You are not a coach, a planner or a clinician.

WHAT YOU MAY DO

- Split what the person wrote into separate activities that can be tracked
  one at a time.
- Carry each activity across in the person's own words. You may trim filler,
  fix capitalisation, and turn it into a plain instruction — "I want to try
  walking in the mornings" becomes "Walk in the mornings". Never substitute a
  different activity word for the one they used.
- Give each activity the cadence the person stated: every day, three times a
  week, at the weekend. If they stated no cadence, leave it unset.
- Carry across any quantity they stated, exactly as they wrote it: a
  duration, a count, a distance, a time of day.
- Order the activities into weeks only if the person described a sequence or
  a build-up themselves. Otherwise give one repeating week.
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

Each activity you return must carry a `source_phrase`: an exact, unmodified
run of characters copied from what the person wrote, being the part of their
text that activity came from. Copy it character for character. The
application checks it against the original and discards your entire answer if
it does not match, so an activity you cannot quote is one you must not
return.

WHEN TO REFUSE

Call `cannot_structure` — do not call `structure_goal` — when:

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
not write a message to them yourself.
```

## The tools

Structured output goes through a tool call rather than "return only JSON" —
that is what `llm.chat` already speaks, and it is how `deduction.py` gets a
parseable answer today.

```python
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
                                "description": "The activity as a plain instruction, in their words.",
                            },
                            "source_phrase": {
                                "type": "string",
                                "description": "Exact substring of the submitted text this came from.",
                            },
                            "cadence": {
                                "type": "string",
                                "enum": ["daily", "times_per_week", "unspecified"],
                            },
                            "times_per_week": {
                                "type": ["integer", "null"],
                                "description": "Only if the person stated it. Otherwise null.",
                            },
                            "quantity_text": {
                                "type": ["string", "null"],
                                "description": "Verbatim quantity they stated, e.g. '20 minutes'. Otherwise null.",
                            },
                            "preferred_time": {
                                "type": "string",
                                "enum": ["morning", "afternoon", "evening", "unspecified"],
                            },
                        },
                        "required": ["text", "source_phrase", "cadence", "preferred_time"],
                        "additionalProperties": False,
                    },
                },
                "sequenced": {
                    "type": "boolean",
                    "description": "True only if the person themselves described a build-up.",
                },
            },
            "required": ["title", "activities", "sequenced"],
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
                    "enum": [
                        "NO_ACTIVITY_NAMED",
                        "MEDICAL_GOAL",
                        "WOULD_REQUIRE_AUTHORING",
                        "UNCLEAR",
                    ],
                }
            },
            "required": ["reason"],
            "additionalProperties": False,
        },
    },
}
```

The refusal returns **a code, not a sentence.** The app owns the four strings
the person actually reads, for the same reason `emergency.py` owns its guidance
copy: user-facing health text is reviewed text, and a model writing its own
apology is unreviewed text on a screen.

## Validation the app performs on the answer

Every one of these is a discard, not a repair. A draft that fails is no draft,
and the person types their own.

1. `source_phrase` for each activity appears **verbatim** in the submitted
   text. This is the check described above.
2. `times_per_week` is null unless `cadence` is `times_per_week`, and is
   between 1 and 7.
3. `quantity_text` appears verbatim in the submitted text too — a quantity is a
   quoted thing, like the phrase it came from.
4. No activity survives if `text` contains a digit that is not in the submitted
   text. A number the person did not write is the most likely shape of an
   invented dose, distance or duration.
5. The activity count is capped. A goal that explodes into fifteen habits was
   not split, it was written.

## What the app owns, and the model never touches

- **Emergency screening**, first, deterministically, before any of this.
- **Every user-facing sentence** except the activity text and title, both of
  which are anchored to the person's own words.
- **Scheduling and notification**, through the existing local-only
  `notificationService` — no push token, no Web Push, for the reasons under
  *Medication reminders* in CLAUDE.md. A reminder naming a health goal on a
  lock screen carries the same exposure as one naming a medication.
- **Progress, completion and streaks.** These are counts of what the person
  ticked. They are not an adherence record and must not be presented as one —
  the same rule that makes a passed reminder "earlier today" rather than
  "missed".
- **Weekly review.** The person's own answers, shown back as a receipt, the way
  `summarise` in `followup.py` does it. Not interpreted, not scored, and never
  used to tell them how they are doing.

## What is deliberately absent

- **No progression engine.** Nothing increases a target because a week went
  well. That is authoring, one week at a time, and it is the exact failure the
  substring check exists to prevent.
- **No second model reviewing the first.** A model gate whose failure mode is a
  silent pass is not a safety layer; this app's existing one is a phrase list a
  person can read. The checks above are deterministic for that reason.
- **No age or minor handling.** It would mean holding a date of birth, and this
  app deliberately holds none — see the pass-through rule for booking identity.
  If a goals feature needs to behave differently for minors, that is a product
  and legal decision before it is a prompt line.

## Vendor note

Goal text is health free text about an identified user, so pointing
`LLM_BASE_URL` at a hosted endpoint — xAI, Groq, Google AI Studio — transmits
it to a third party. **This project has a BAA with nobody**, and some free
tiers train on input. `endpoint_is_local()` already makes the distinction
visible, and a local endpoint raises no BAA question at all. Which URL is
configured is a data-handling decision, not a preference, exactly as recorded
for triage.

Goals would also be another plaintext health table beside `medications` and
`intake_assessments` — open finding 2 in CLAUDE.md, unchanged and now larger.

## For the reviewer

1. Is "structuring only" a line that holds? Splitting "walk and swim" into two
   activities is clerical. Deciding that "wind down before bed" is one habit
   rather than three is closer to a judgement.
2. Should `MEDICAL_GOAL` route somewhere rather than only refusing? "Lose 20
   pounds" and "come off my tablets" are things people genuinely want, and a
   dead end may push them to a worse tool.
3. Is a refusal for a goal with no named activity the right default, given that
   it is the most natural thing to type into an empty box?
4. Does a goal reminder on a lock screen need different copy from a medication
   one?
