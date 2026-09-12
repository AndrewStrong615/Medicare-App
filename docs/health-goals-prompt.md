# Health goals: the planning prompt

**Status: built.** `backend/app/core/goal_structuring.py` holds the prompt and
the checks, `backend/app/api/goals.py` the endpoints, and the Goals tab the
screens. The repository owner approved building it in conversation on
2026-09-07.

⛔ **Approval to build is not clinical sign-off.** The prompt, the refusal
list and the cadence copy are a software engineer's construction and belong in
the same clinician read as `followup.py` and `dose_schedule.py`. Nor is it
approval to merge to `main` or deploy — CLAUDE.md fences those separately, and
they need their own answer.

**The prompt itself lives in `SYSTEM_PROMPT` in
`backend/app/core/goal_structuring.py`, and this file no longer repeats it.**
One copy of an instrument, the same rule that keeps the triage tier
definitions in `triage.py` while `deduction.py` stays machinery — two copies
drift, and a reviewer then has to guess which one runs.

This document is the reasoning: why the feature is shaped this way, what is
checked, and what a reviewer should decide.

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

## The prompt and the tools

Both live in `backend/app/core/goal_structuring.py`: `SYSTEM_PROMPT`,
`STRUCTURE_GOAL` and `CANNOT_STRUCTURE`. Read them there.

Structured output goes through a tool call rather than "return only JSON" -
that is what `llm.chat` already speaks, and it is how `deduction.py` gets a
parseable answer today.

The refusal tool returns **a code, not a sentence.** The four strings a person
reads live in `_REFUSAL_NOTICES` in `backend/app/api/goals.py`, for the same
reason `emergency.py` owns its guidance copy: user-facing text in a health app
is reviewed text, and a model writing its own apology is unreviewed text on a
screen.

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
- **Ticking off.** A tick is a note the person made for themselves on a local
  calendar day. It is not an adherence record and must not be presented as one
  — the same rule that makes a passed reminder read "earlier today" rather
  than "missed". There is deliberately no streak, no score and no percentage,
  stored or displayed, and `HealthGoalsScreen` has a test asserting the words
  never appear.

**Not built, deliberately.** Reminders for a goal, and any weekly review, are
absent. Neither is blocked on anything hard — a goal reminder would reuse the
local-only `notificationService` and a review would follow `summarise` in
`followup.py` — but both add surface to an instrument no clinician has read
yet, and a reminder naming a health goal on a lock screen carries the same
exposure as one naming a medication.

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

## ⛔ 2026-09-12: the blocking was removed, and this section is now the guard

The repository owner asked, in conversation, for the feature that blocked
health plans to go and for the section to produce a plan and a daily schedule
for any goal typed in. Two things were deleted:

- the `MEDICAL_GOAL` and `WOULD_REQUIRE_AUTHORING` refusal codes, so a goal
  about weight, blood pressure or a symptom is planned for rather than turned
  away; and
- `_FORBIDDEN`, the phrase list that discarded a whole plan on one match.

**`PLAN_SYSTEM_PROMPT` is now the only thing constraining an authored plan.**
It is an instruction, not a check — it fails open and silently, where the
phrase list failed closed. That makes the review below more urgent than it
was when this document was written, not less, and it changes what the reviewer
is being asked to sign off: not a structuring step with a safety net, but an
app that writes health plans for named conditions with a prompt in front of
it.

The prompt still refuses a medication, a dose, a change to anything
prescribed, a target figure for a clinical measurement, and any claim about
what an activity will do for someone. Those are the lines judged to be a
clinician's call rather than a plan. Whether they are the right lines, and
whether a prompt is an acceptable place to put them, is question 2 below.

## For the reviewer

1. Is "structuring only" a line that holds on the fallback path? Splitting
   "walk and swim" into two activities is clerical. Deciding that "wind down
   before bed" is one habit rather than three is closer to a judgement.
2. **Now the most important question.** With `_FORBIDDEN` gone, should a
   narrow, reviewed veto list be reinstated — and what belongs on it? It was
   deliberately not guessed at when the old list was removed. This is the
   cheapest safety work available in the feature.
3. Are the prompt's remaining refusals the right ones — medication and dose
   changes, clinical target numbers, benefit claims — and are they in the
   right place, given a prompt cannot be relied on the way a check can?
4. Is a plan for a medical goal ("lose weight", "get my blood pressure down")
   something this app should produce at all, now that it does? The owner asked
   for it; the clinical question is separate from the product one.
5. Are the proposed **times and days** in scope for this review? MedHelp now
   picks an hour and a set of weekdays for each activity. They are ordinary
   waking hours with no clinical reasoning behind them, and the person edits
   them, but the app is choosing when someone does something.
6. Is a refusal for a goal with no named activity the right default, given that
   it is the most natural thing to type into an empty box?
7. Does a goal reminder on a lock screen need different copy from a medication
   one?


## Diagnosing "MedHelp has no suggestions right now"

That one sentence covers every way the model layer can fail to produce a
draft, and they are different repairs. The application log separates them —
see `docs/free-model-setup.md` for the provider error codes, and:

| In the log | What happened |
|---|---|
| `Health goals have NO MODEL configured` (at boot) | no key or endpoint resolved — the settings are not reaching the process |
| `Health goal descriptions are being transmitted to…` | the endpoint resolved; the call was made |
| `Model endpoint returned HTTP 401 (invalid_api_key…)` | the key was rejected |
| `Model endpoint returned HTTP 404 (model_not_found…)` | the model name is wrong or retired |
| `Goal draft discarded by check: …` | the model answered and a check rejected the answer |

The absence of the transmission line is itself the finding: it means no goals
endpoint was configured in that process, whatever the dashboard says.
