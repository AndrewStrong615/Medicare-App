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

## 2026-09-13: it produced the same plan for every goal

Reported by the owner: a goal of losing one pound and a goal of losing a
hundred returned the same plan, and the plans were vague generally.

The direct cause is worth repeating because it is now the second bug of its
kind here: **`WHAT TO PROPOSE` illustrated the shape of a row** with "Walk
after lunch", "Go to bed at the same time each night" and "Cook dinner at
home", and the model returned those three as the plan. An example in a prompt
is a suggestion, not an illustration — the same thing that happened to "Daily
routine" and "Movement and meals" in the title rules a few weeks earlier.
Every example left in this prompt is now either named as a failure or built so
it cannot be lifted without the goal matching.

The prompt also never asked the model to read the goal, and told it to assume
everyone was starting from nothing — a uniform floor produces a uniform first
step. Three sections were added: `READ THE GOAL BEFORE YOU PLAN IT`, `SCALE
CHANGES THE PLAN, AND IN ONE DIRECTION ONLY`, and `BEFORE YOU ANSWER, READ THE
PLAN BACK`. The planner also stopped decoding greedily
(`goal_structuring.PLAN_TEMPERATURE`); `llm.chat` still defaults to 0 and
triage still takes that default.

⛔ **The safety half.** Scale may change how many rows a plan has, which days
they sit on, and how long a rhythm is meant to last. It may never raise an
amount, add intensity, lengthen a session or set a figure to reach. A reviewer
should read the new sections with that distinction in mind, because it is the
one a careless reading collapses.

**Responsiveness is now measurable**: `backend/scripts/goal_plan_eval/` runs a
corpus of synthetic contrast pairs against a live endpoint and counts shared
rows, pair overlap, reused titles and whether a plan uses any word of its own
goal. It says nothing about whether a plan is safe or good.

### "Proven to work through medical research"

Asked for at the same time, and it cannot be answered by this feature as
built. Labelling a plan evidence-based, citing a guideline under a row, or
linking a study beside one each makes a health claim about text a language
model wrote under a prompt no clinician has read — a stronger claim than the
benefit sentence the prompt already forbids, not a weaker one.

Two routes reach it, both procurement rather than engineering: licensed,
professionally reviewed behaviour-change content loaded through an empty
container (the `protocol_content.py` shape), or question 2 below answered
along with a clinician's read of the plans themselves. Until then the honest
position is the one `GoalCreateScreen` already states.


## 2026-09-13, later: detailed, sourced, and sized to the goal

The owner asked for "very detailed and proven plans ... take into account for
the complexity and difficultness of the goal". Three separate builds.

**Detail.** Every suggested row carries one or two sentences saying how to do
it on the day. Required; a row without one discards the plan. It says how and
never why — the no-benefit-claims rule applies to it word for word, and it is
easier to break there than in a row title because a sentence has room to
explain itself.

**Evidence.** `app/core/goal_evidence.py` is a closed register of eight
published recommendations from named public health bodies, each quoted verbatim
with a link. The planner picks an **id** from it; it cannot write a publisher,
a URL, a quote or a study, and there is no field in the tool schema where one
could go. An unknown id becomes no citation rather than the nearest one.

⛔ The reviewer's question is not whether the quotes are real — they are fetched
and verbatim, and a test holds them to whole published sentences on `.gov`
hosts. It is whether **the mapping is sound**. A model decides that a given row
belongs to `aerobic_activity`, and nobody qualified checks that. A citation
attached to the wrong row is a government document appearing to endorse
something it is not about, and that failure is invisible to every check in the
system.

⛔ Two of the eight quotes are framed as benefits rather than recommendations —
the vegetables one says "help you feel full longer", the water one "can help
reduce caloric intake". They are the publisher's words, attributed and
caveated, not MedHelp's. A reviewer should still say whether a benefit sentence
quoted under a row in a weight-loss plan reads, to the person holding the
phone, as the app making that claim. If the answer is yes, the fix is to prefer
recommendation-shaped quotes and drop those two.

**Complexity.** The planner declares `small` / `moderate` / `major` and the row
count must agree (1–3 / 3–4 / 4–5). A missing or unrecognised reading discards
the plan rather than defaulting. It bounds how many things a plan contains and
says nothing about how hard any of them is — that distinction is the whole of
the safety argument, and it is one careless edit from collapsing.

The reading is returned by the API and deliberately not rendered: telling
somebody their goal is "major" is a judgement about their ambition, and this
app does not make one.

**A second band was added on 2026-09-13**, after a report that a goal of
losing a hundred pounds in a year came back as four rows on four days: ten
minutes of exercise, a glass of water and an early night. Row count could not
see that — four rows is a perfectly good four rows — so
`WEEK_SHAPE_BY_COMPLEXITY` bounds the shape of week a plan makes.

⛔ **Its floor and its ceiling count different things.** A floor counts **how
many days of the week the plan appears on** (major: 5, moderate: 2), because
that is literally what "present on most days" means. A ceiling counts
**day-slots**, one row on one day summed over the rows (small: 14), because
what a ceiling rules out is total volume.

They are not interchangeable, and getting it wrong costs a real person their
plan. A daily walk plus three weekend errands is only **10 day-slots** and is
on **all 7 days**; the reported plan is 4 slots on 4 days. A slot floor high
enough to reject the second also rejects the first, which is a good answer to
a year-long goal.

⛔ It bounds **coverage**, never effort. Three gentle rows and three gruelling
ones on the same schedule are indistinguishable to it, on purpose, and a test
asserts exactly that so nobody later reads it as a safety control.


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
8. **Added 2026-09-13.** Now that plans are specific to the goal rather than a
   template, they are far more likely to be acted on. Does that change the
   answer to 2, 3 or 4 — and is the "scale may change the plan but never make
   it harder" rule the right line to have drawn?
9. **Added 2026-09-13.** Is a model-chosen mapping from an activity to a
   published guideline acceptable at all, given nobody checks it? And do the
   two benefit-shaped quotes in the register belong there? See above.
10. **Added 2026-09-13.** Are the `detail` sentences within bounds? They are
    the newest place a benefit claim can appear and the roomiest.
11. **Added 2026-09-13, and the biggest question in this list now.** The
    prompt used to cap every plan at "modest starting points"; it now builds
    the week towards the CDC's published adult figure — 150 minutes of
    moderate activity a week plus strengthening on about two days — and may
    never go past it. The figure is quoted verbatim in `goal_evidence.py` and
    is not ours. **Is reading a published adult recommendation as the ceiling
    for a general-purpose goal box the right call, and is `complexity` the
    right thing to scale towards it?** A plan that fills more of somebody's
    week is a bigger intervention than one that fills less, even with every
    intensity rule held.
12. **Added 2026-09-13.** `WEEK_SHAPE_BY_COMPLEXITY` requires a plan the
    model called "major" to appear on at least **five days of the week**. That
    number is a software engineer's, it is a floor on *coverage* and never on
    effort, and a plan that misses it is discarded — the person gets an empty
    editor. Is five right, and is a discard the right failure, or should a
    thin plan be shown with its thinness stated?
13. **Added 2026-09-13.** Vagueness is asked for in the prompt and not
    checked anywhere, because "drink a glass of water after waking" is a
    concrete row that answers nothing and no deterministic test separates
    those. Is that the right place to leave it?


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
