# CLAUDE.md

Guidance for Claude Code (and any other agent) working in this repository.

## App Scope

**Purpose:** Helps users look up general information about common symptoms/conditions
and set medication reminders.

**This app is informational only.** It must never:
- Diagnose a user's condition
- Recommend a specific treatment
- Present itself as a substitute for professional medical advice

Every screen that displays symptom or condition information **must** include a
visible, non-dismissible-by-accident disclaimer directing the user to consult a
healthcare professional. Do not ship any such screen without one.

**Emergency handling:** If a user describes anything resembling an emergency
(e.g., chest pain, difficulty breathing, severe bleeding, suicidal ideation,
loss of consciousness), the app must surface emergency-services guidance
("Call 911 / your local emergency number now") instead of generating any
app-authored advice. Emergency detection and routing takes priority over normal
symptom-lookup flow. See `docs/emergency-guidance.md` (to be written when that
feature is built) for the keyword/flow spec.

Treat any UI copy or backend response touching symptoms, conditions, or health
recommendations as sensitive by default — see "Subagents" below.

## Tech Stack

- **Frontend:** React Native (Expo) + TypeScript, React Navigation
- **Backend:** FastAPI (Python 3.11+)
- **Database:** PostgreSQL, SQLAlchemy ORM, Alembic for migrations
- **Auth:** JWT-based (placeholder implementation for now — see Known Gaps)
- **Target platforms:** iOS and Android (via Expo), eventually published to
  App Store / Play Store

This stack was chosen by Claude as a reasonable default for a cross-platform
mobile app with a Python backend. If you'd prefer a different stack (e.g. Flutter,
Next.js + React Native Web, Django instead of FastAPI), say so before much more
code is built on top of this — it's much cheaper to change now.

## Data Rules

- **No real patient/health data anywhere in this repository, ever.** All dev
  and test data (fixtures, seed scripts, screenshots, example payloads) must be
  synthetic/fake only. Never paste real symptoms, conditions, or medication
  data from a real person into this repo, issues, or commit messages.
- Any field that could later hold real health data (symptom entries, medication
  names/dosages/schedules, free-text notes) must be **designed for encryption
  at rest and in transit from the start**, even though the current scaffold
  does not yet implement it:
  - Transit: HTTPS/TLS everywhere, no exceptions for internal traffic.
  - At rest: prefer column-level or full-disk encryption on the database;
    avoid storing sensitive free-text fields unencrypted "temporarily."
  - Do not log request/response bodies that contain user health data.
- **BAA flag:** Before this app goes live with real user data, anywhere it
  touches a cloud vendor (hosting, database, email/SMS for reminders, push
  notifications, crash/analytics reporting, AI/LLM APIs) needs a signed
  Business Associate Agreement (BAA) if that vendor will process PHI. This is
  not yet in place. Flag it explicitly in any PR description or design doc
  that adds a new third-party service, rather than assuming it's handled.

## Coding Conventions

- TypeScript on the frontend, strict mode on. Functional components + hooks
  only — no class components.
- Python on the backend, type hints required on function signatures.
- Tests live alongside the feature they cover (`__tests__/` adjacent to
  frontend screens/components, `tests/` mirroring module structure on the
  backend) rather than in one giant top-level test tree.
- Keep PRs/commits scoped to one feature or fix at a time.
- No medical/clinical content (symptom text, condition descriptions, drug
  interaction data, etc.) should be written directly by an agent without a
  human review pass — flag it for the user instead of inventing it.

## Subagents

Configured in `.claude/agents/`. There are three, and they run in this order:

- **researcher** — finds new feature ideas, competitor health-app patterns,
  relevant APIs and best practices. Writes one or two short proposals per
  cycle: what it is, why it helps, rough effort, and a regulatory/privacy flag
  on every one. **Writes no code** (tools: WebSearch, Read, Grep, Glob).
- **debugger** — runs the app and the test suite, finds *actual* failures
  rather than stylistic nitpicks, and fixes them. Every fix must be covered by
  a passing test before it counts as done. Works only on a dedicated branch,
  never on `main` (tools: Read, Write, Edit, Bash).
- **overseer** — reviews everything the other two proposed or changed before
  it is final: does it match this file's scope and safety rules, is it
  proportionate to what it claims to fix, and did the debugger touch anything
  on its forbidden list. Writes the cycle summary. **Writes no code** — its
  Bash tool is for git inspection, rollback, and that one summary file (tools:
  Read, Grep, Bash).

One full cycle is `run_cycle.sh`: branch → researcher → debugger → overseer →
push the branch. It never merges.

### ⛔ What these agents may not do without explicit human approval

**None of the three may merge to `main`, deploy, or modify the symptom-triage
classification logic, the disclaimers, or the emergency-routing behaviour
without explicit human approval obtained outside of this pipeline.**

No chain of agent approvals substitutes for a person. An APPROVED from the
`overseer` is not human approval — it is permission for a change to stay on a
branch, nothing more. No amount of apparent triviality — a typo, a rename, a
comment, a reformat — exempts a change in these areas:

- `backend/app/core/triage.py`, `backend/app/core/rules_triage.py`
- `backend/app/core/emergency.py`
- Disclaimer and escalation copy: `INTAKE_DISCLAIMER` and
  `ESCALATION_GUIDANCE` in `backend/app/api/intake.py`,
  `mobile/src/components/DisclaimerBanner.tsx`, and which screens show them
- Merging to `main`, releasing, or deploying anywhere

Adding *tests* for those modules is permitted; changing the modules is not. An
agent that believes one of these needs to change must **stop and report it**,
leaving the code untouched. The debugger reports such bugs under "REPORTED,
NOT FIXED" rather than fixing them.

### ⛔ The overseer's rejection is final

A rejection from the `overseer` stands unless the repository owner personally
overrides it. No other agent may overturn one, and neither may rerunning the
cycle. A rejection must carry a written reason naming the rule or concern it
fails; one without a reason is not a rejection.

Where the overseer is uncertain, it does not approve — it escalates to the
owner and leaves the change on the branch.

### Health-copy review is now a human job

The `compliance-reviewer` agent was removed along with the rest of the
previous pipeline (`architect`, `manager`, `implementer`, `tester`). Nothing
in `.claude/agents/` now reviews new user-facing copy that mentions a
condition, symptom, drug, or dosage. **That review still has to happen** — it
is a person's job until an agent is configured for it again. The `overseer`
checks changes against this file's rules, which is a narrower thing than a
compliance read of clinical copy.

## Known Gaps (intentional, for this scaffolding pass)

These are stubbed out on purpose — do not treat them as bugs to silently fix,
raise them with the user first:

- Auth is a placeholder (no real password hashing storage backend wired up,
  no real token refresh flow, no real session invalidation). The session does
  now survive a reload — see "The session survives a reload, and dies with the
  tab" below — but nothing renews it and nothing can revoke it.
- No encryption-at-rest implementation yet (see Data Rules above).
- No BAA-covered vendors selected yet.
- Medication reminders now exist (see "Medication reminders" below), but
  **background delivery on the web does not** — a browser only alerts while
  the page is open. That is a vendor/BAA decision, not an engineering gap.
- Appointment *tracking* and provider *search* now exist (see "Appointments
  and provider search" below); appointment *booking* does not, and is blocked
  on a partnership and a BAA rather than on engineering.

## Medical content: where it comes from

The app never authors medical content. All symptom and condition text is
fetched from **MedlinePlus**, published by the US National Library of Medicine
(NIH), through its public health-topics API. No API key is required.

Rules for anyone extending this:

- Render source text **verbatim**. Do not summarise, paraphrase, shorten, or
  split it into your own sections. Rewriting sourced material makes it
  app-authored medical content.
- Do not extract "causes" (or any other clinical category) out of a summary.
  A bulleted list in these topics is sometimes causes, sometimes symptoms,
  sometimes treatments; relabelling one as another invents a clinical claim.
  The source's own topic categories are surfaced as "May be associated with".
- Always carry attribution (`source_name`) and the link back to the topic.
- If the source is unavailable, show an error. Never fall back to generated
  content.
- Free text is reduced to search terms before lookup
  (`backend/app/services/search_terms.py`): filler is deleted, then the query
  broadens a word at a time until something matches. This is retrieval only —
  it chooses which source article to fetch and never alters the text shown.
  Deterministic, no model, no key.

  Three rules in that file exist because of measured wrong answers, not
  theory, and each one is orthographic or positional rather than clinical:

  - **Conversational scaffolding is filler** (`_CONVERSATIONAL`). "my doctor
    is away and I have got a pounding headache" used to search *"doctor away
    pounding"* before it ever searched "headache", and "not really sure what
    is going on…" attached "Cholesterol Levels: What You Need to Know" on the
    word *what*.
  - **Single words are tried last-word-first.** English puts the complaint at
    the end and its qualifiers in front, so "cough" is tried before "dry" and
    "cholesterol" before "high". Front-first is what sent "a dry cough" to
    "Dry Mouth" and "painful urination" to "Chest Pain".
  - **Negations are kept but never searched or matched alone**
    (`_NEGATIONS`). "not going down" still means something; the bare word
    "not" returned "Advance Directives", published by NLM under the name "Do
    Not Resuscitate", and attached it to a headache.
- A topic is only shown if **a name the source gives it contains a word the
  user wrote** (`names_match`) — its title, or one of NLM's own published
  `altTitle` synonyms. The upstream ranking is loose — "swollen ankle" returns
  "Diabetic Heart Disease" above anything about ankles, and printing that
  under someone's description reads as a suggested diagnosis. Non-matching
  topics are dropped, never reordered: ranking health topics by relevance
  would be a clinical judgement this app may not make.

  The alternate titles matter because NLM files topics under a clinical
  heading and publishes the lay name separately: "Bunions" is an altTitle of
  "Toe Injuries and Disorders", "Sunburn" of "Sun Exposure", "Plantar
  Fasciitis" of "Heel Injuries and Disorders". Matching only the title told
  those users nothing matched, while the source was saying that word is the
  topic's name. They are **match input only** and are never rendered.
- **Known limit:** the filter is lexical, so a context word that happens to
  name a topic still gets through — "my head has been pounding" returns
  "Head and Neck Cancer", "nauseous after eating" returns "Eating Disorders".
  Both were re-checked against the live service after the changes above and
  both still happen. **This is still the reason the feature is gated off.**
- Retrieval accuracy is measured, not asserted. Against 1,190 synthetic
  descriptions run through the live service, the share that attach a topic
  actually about the complaint went from **70.8% to 91.0%**, and off-target
  attachments fell from 255 to 37. Queries per assessment fell too — 1,409
  distinct upstream searches became 557, and 85% of assessments now match on
  the first query. Anyone changing this file should re-measure rather than
  reason about it.

### ⛔ Related reading is gated off (`MEDLINEPLUS_TOPICS_ENABLED=false`)

Intake ships with reading material **switched off**, after a compliance review
found the limit above unacceptable to put in front of users: a frightening,
unrelated topic rendered under a person's own description reads as a suggested
diagnosis regardless of the framing around it.

Do not switch it on until a clinician has ruled on how topics are chosen.

- While off, **no MedlinePlus request is made at all**, so no symptom text
  reaches NLM and that vendor's BAA question is moot for as long as it stays
  off.
- The retrieval code (`app/services/search_terms.py`) and its tests are intact
  and still exercised — the flag gates the call, not the code.
- A lexical tightening was tried and rejected: requiring more than a bare
  body-part word to match empties the good cases ("swollen ankle" → nothing).
  Telling a location word from a symptom word is a semantic judgement, so the
  realistic fix is model-assisted topic selection — still retrieval, not
  authoring — which needs its own review.
  - The second example that note used to give, "my lower back hurts" → "How
    to Lower Cholesterol", **no longer happens**: single-word queries are now
    tried last-word-first, so "back" is searched before "lower" and the
    description returns "Back Injuries" and "Back Pain". That fixes one
    documented wrong answer. It does not fix the class — "my head has been
    pounding" still returns "Head and Neck Cancer", because *head* is a word
    the person genuinely wrote and a topic is genuinely named after it.
- Symptom intake attaches this reading to every tier except EMERGENT, where
  the only thing worth showing is how to get emergency help and a content
  fetch would just delay it. When nothing matches, the screen says so rather
  than filling the gap.

### Third-party vendor: NLM / MedlinePlus — BAA status

Every symptom search is transmitted to `wsearch.nlm.nih.gov`, a third party,
carrying free-text health input written by the user.

- **No BAA is in place, and NLM does not sign one.** If this app ever handles
  data covered by HIPAA, this call path needs a privacy/legal decision — not
  an engineering one. Options include proxying with the query stripped of
  identifiers, licensing a redistributable dataset and serving it locally, or
  accepting the exposure with user consent.
- The search screen shows a user-visible notice that searches leave the app.
- The user's text reaches the app's own backend by **POST**, never as a URL
  query string, so it stays out of our access logs, proxies, and crash
  reporters.
- **The onward call to NLM is a GET, with the search term in the URL**
  (`app/services/medlineplus.py`). This bullet previously claimed the NLM call
  was a POST; it never was. Search terms therefore do land in NLM's access
  logs and any intermediary between here and them. Part of the same
  privacy/legal decision as the BAA question above, not separable from it.
- What is sent is **not the user's full description**: it is at most three
  keywords extracted by `app/services/search_terms.py`, which cuts the text
  leaving the app substantially compared with sending the raw sentence.
- **Symptom-intake follow-up answers are in scope too.** Answers to the
  prompts in `app/core/followup.py` are merged into the description before
  the keyword extraction and the lookup, so elicited detail is covered by
  everything above, and the merged text is what `intake_assessments` stores.
- Validation errors are stripped of the submitted value before being
  returned (`app/main.py`), so a rejected query is not echoed back.

## ⛔ BLOCKING: symptom intake requires clinical and legal sign-off

The symptom-intake feature (`backend/app/core/triage.py`) estimates how soon a
user should be seen — EMERGENT, URGENT, or SELF_CARE — from free text, using a
language model. **It must not be put in front of real users until both of the
following are signed off and recorded here.** This is a release blocker, not a
recommendation.

1. **A licensed clinician** must review the tier definitions, the system
   prompt, the deterministic red-flag lists, and a corpus of real
   classifications. Nothing in this feature was written or reviewed by a
   clinician; the tier boundaries are a software engineer's construction.
2. **Legal counsel** must determine whether this is a regulated medical
   device in each target market. Software that recommends time-critical care
   ("go to an ER now") from symptom input is materially different from
   reference content, and the earlier informational-only posture of this app
   does not cover it. Also unresolved: liability for an under-triage, and what
   the audit trail must retain.

Additional known limits a reviewer should be told about:

- The classifier has **no validated error profile**. Unlike an instrument such
  as ESI or Manchester Triage, nobody has measured its under-triage rate. The
  architecture biases toward over-triage, which is the safer direction, but
  "biased safe" is not the same as "measured safe".
- The audit trail exists (`intake_assessments`) but **nobody is reviewing it
  yet**. Logging classifications is only useful if someone qualified reads
  them; assign that owner.
- Intake descriptions are the most sensitive free text in the app and are
  **not yet encrypted at rest**.
- **The clarifying questions are in scope for the clinical review.** The
  prompts in `app/core/followup.py` are elicitation, not screening — no
  threshold, no hypothesis test — but which questions get asked shapes what
  the classifier sees, so a reviewer should read them as part of the
  instrument rather than as UI copy. The severity scale in particular is a
  number the app collects and does not act on; a reviewer should say whether
  that is right.

  There are now **two rounds**. Round one asks the questions the description
  has **not already answered** (`answered_by_description`): a person who wrote
  "my throat has been sore since yesterday" is not asked where it is or how
  long it has been going on. The tests are lexical and closed — a list of lay
  anatomy nouns, a list of time expressions, a list of intensity words — and
  they only ask whether ground has been covered, never what a symptom means.
  They are deliberately conservative, because a missed detection costs one
  redundant question while a false one loses information the classifier
  needed. Two properties hold, both tested: **associated symptoms are never
  skipped** (the answer cannot be inferred from what was written, and it is
  the net that catches an unmentioned symptom, so it also keeps the round
  non-empty), and **no round-two id ever appears in round one**, because
  `rounds_completed` reads the round off the answer keys and that is what caps
  asking server-side. Which questions get skipped is part of the instrument
  and needs the same review as the prompts. Round two is three
  questions: onset and course always, plus a third picked from a fixed list by
  a short chain over round one's answers (severity ≥ 8 → functional impact;
  brand new or "not sure" → whether it is constant; a week or more → whether
  it has happened before; otherwise → what has changed recently). The
  selection is deterministic — the same answers always produce the same
  questions — which is what makes it reviewable. **The selection rule is
  itself part of the instrument and needs the same review as the prompts.**
- **The model may now decline to classify** (`NEEDS_MORE_INFO`), which is not
  a fourth tier and cannot be ranked against one. It only adds a question; the
  rule tier stands underneath it, and asking is capped at `followup.MAX_ROUNDS`
  (two) after which the safe default (URGENT) is applied and stated plainly.
  A reviewer should confirm that two rounds is the right cap.
  - Asking also stops early if a round comes back with nothing usable — every
    answer blank or "I'm not sure". Someone who could not answer the first set
    will not do better with a second, and asking again would trap them.
  - **The cap is enforced server-side, from the answer ids**, not from a round
    number the client reports. The two question sets have disjoint ids, so a
    client cannot talk its way into a third round.
- **The result screen now shows a recap of the answers** (`summarise` in
  `followup.py`, rendered as "What you told us"). It is a receipt, not an
  interpretation: each row is a fixed field label beside the user's own text,
  verbatim. Nothing is combined, rephrased, categorised or reasoned about, and
  **no condition is ever named** — that is the line between this and the
  differential diagnosis the app must not produce. Answers of "I'm not sure"
  are reported as still unknown rather than as facts. It exists because
  "MedHelp could not confidently recognise what you described" is the same
  sentence every time, and naming what is still blank is the part that
  actually explains a cautious estimate.
- **`model_confidence` is recorded and never acted on.** LOW/MEDIUM/HIGH is
  stored on `intake_assessments` so a reviewer can ask whether the wrong calls
  are the low-confidence ones. It must not become an input to the tier without
  that review — a confidence threshold that softens a tier would invert the
  one-directional safety property the whole design rests on.

### How the safety architecture works

Two layers. **The rule layer is the product; the model is an optional
upgrade.** Read `backend/app/core/rules_triage.py` and
`backend/app/core/triage.py` before changing any of it.

**Layer 1 — rules (`rules_triage.py`). Always runs. No key, no network, no
cost.** Explicit phrase lists a clinician can read line by line, evaluated in
order: emergency red flags → urgent indicators → recognised self-limiting
complaint → default. Deterministic, so the same input always gives the same
tier — which is what a clinical review needs.

**Layer 2 — the model (`triage.py`). Optional.** Consulted only when
credentials exist; skipped silently otherwise. A missing key degrades quality,
it does not break the feature.

Layer 2 has **two interchangeable implementations**, and `_classify_with_model`
picks one. Both return the same `ModelVerdict`, both are reconciled by the same
`max()`, and neither can lower a tier — choosing a source is not choosing an
answer.

| | When | Shape | Cost |
|---|---|---|---|
| `deduction.py` | `LLM_BASE_URL` + `LLM_MODEL` set | agentic loop | free |
| `triage._classify_with_anthropic` | otherwise, if Anthropic creds exist | one shot | paid |

Five properties hold, each asserted by tests:

1. **SELF_CARE must be positively earned.** It requires a match against a
   recognised self-limiting complaint *and* no escalating modifier. Anything
   unrecognised resolves to URGENT. Not understanding a description is not the
   same as it being harmless — this is the single most important rule here.
2. Emergency red-flag screening runs **first** and sets a floor of EMERGENT.
3. Neither layer can **lower** the other's tier. They reconcile with `max()`,
   so either can escalate and neither can de-escalate.
4. The displayed reasoning never argues for a lower tier than the one shown.
   A model answer of SELF_CARE that lost to an URGENT rule does not get to
   supply the explanation.
5. Failure is **never** SELF_CARE. A model outage falls back to the rule tier;
   there is no path where an error produces reassurance.

**Adding or changing a rule:** add the phrase to the right list in
`rules_triage.py`, add a test, and remember that the lists are lay language —
people write "my face is drooping", not "face drooping". A stroke description
in natural word order was missed for exactly that reason; match both orders.

**Audit trail.** `intake_assessments` records the final tier, the rule tier,
which named rules fired, whether the rules defaulted, and what the model said
separately — so a reviewer can measure the rules and the model independently.

### The agentic layer (`deduction.py`), and the free endpoint under it

Setup and provider options: `docs/free-model-setup.md`.

The model layer used to be reachable only through a paid Anthropic key, so a
deployment without one ran on rules alone. It now also speaks to **any
OpenAI-compatible chat endpoint** (`app/services/llm.py`) — a hosted free tier
or a model on your own machine — and when one is configured, the model is
driven through a **bounded tool-using loop** rather than asked for a tier in
one call.

✅ **THE FENCE ON `triage.py` IS CLEARED FOR THIS CHANGE.**

The repository owner asked for this directly in conversation on 2026-09-05 —
use a free AI for symptoms, with agentic deduction in place of the rules-only
path — and that request is why the work exists. That request alone was **not**
the sign-off this fence requires, and an earlier draft of this paragraph that
claimed otherwise was rejected by a compliance review: a sentence an agent
writes into the same diff that needs authorising is not evidence of
authorisation.

The actual approval came separately, on 2026-09-06, when the owner was asked
by name — "Do you approve modifying `backend/app/core/triage.py` and adding
`backend/app/core/deduction.py` as a second (free, agentic) path to a
symptom-urgency tier — the fenced change CLAUDE.md requires you to approve by
name before it's committed?" — and answered, in conversation, in their own
words: **"Yes, approved as-is."** That is the third instance of this file's
"explicit human approval obtained outside of this pipeline," alongside the
`normalize_query` fix and the deployment approval below — a person answering a
direct question, not a chain of agent sign-offs.

**What was approved, specifically:** modifying `backend/app/core/triage.py`
(the dispatch in `_classify_with_model`, the `trace` fields, the renamed
`_classify_with_anthropic`) and adding `backend/app/core/deduction.py` as a
second, free path to a tier. **What this does not cover:** it is not approval
to merge to `main`, deploy, or touch anything else this file fences — those
each need their own answer to their own question, same as this one did.

What the change does *not* touch, verified by byte-diff against HEAD: any
disclaimer, any escalation copy, the emergency phrase lists, the rule lists,
`SYSTEM_PROMPT` and its tier definitions (4406 bytes, identical), and the
Anthropic layer's body (identical; only its name and docstring changed).

Per assessment the model calls `screen_red_flags`, then `apply_rules` — the
app's own deterministic screens — then records its reasoning a step at a time,
then concludes.

- **`conclude` is refused until both screens have been read.** A conclusion is
  therefore grounded in the reviewed phrase lists rather than in the model's
  recollection of them.
- **The screens take no arguments.** They always run over the description
  exactly as submitted. A tool that let the model choose the text would let it
  screen a rephrasing and talk itself out of a red flag.
- **The loop is bounded** (`MAX_STEPS`). Not concluding is an outage, not a
  tier, and the rule tier stands.
- **There is one copy of the instrument.** The tier definitions stay in
  `SYSTEM_PROMPT` in `triage.py` and are passed in, so a reviewer reads one
  prompt. `deduction.py` is machinery, not judgement.
- **The derivation is recorded** and goes to the dev-only classification log —
  never to the user, who gets the written reasoning instead. It is not written
  to `intake_assessments`: that needs a new column and this project has no
  migration tooling (see "Known Gaps"). Persisting it is a follow-up, and it
  is the thing that would make a wrong call diagnosable rather than merely
  visible.

⛔ **This does not lift any release blocker.** Driving the same unreviewed tier
definitions in more steps does not review them, and the classifier still has no
validated error profile. What changed is that a reviewer can now read a
derivation instead of a verdict, and that the layer no longer requires a paid
account.

### Third-party vendor: the model endpoint — BAA status

**Which base URL is configured is a data-handling decision, not a preference.**
Symptom descriptions are the most sensitive free text in this app.

- **A local endpoint** (`http://localhost:11434/v1`, Ollama or llama.cpp)
  transmits nothing. No image, no description and no derivation leaves the
  machine, so **no BAA question arises at all** — the same reasoning that put
  label OCR on the device.
- **A hosted free tier** (Groq, Google AI Studio, OpenRouter) transmits the
  full description to a third party, and **this project has a BAA with
  nobody**. Google's free tier may additionally use input for training. That
  is a privacy/legal decision, not an engineering one, exactly as with NLM.
- `llm.endpoint_is_local()` exists so the distinction is visible rather than
  assumed, and a non-local endpoint **logs a warning naming the exposure**, as
  this file requires of any new third-party processor. That does not make it
  safe; it stops it being silent.
- **Nothing from the request body reaches the application log.** Failures
  report a type and an HTTP status code only — a provider error body can quote
  the request, which is the user's description. A test asserts it.
- Defaults are empty, so out of the box there is no model layer and no
  transmission.

## Emergency routing (implemented)

`backend/app/core/emergency.py` screens every symptom query for red-flag
language before the content lookup runs: cardiac, breathing, stroke,
bleeding/trauma, anaphylaxis, loss of consciousness, self-harm, and
overdose/poisoning.

- Screening is deliberately **over-inclusive**. A false positive costs the
  user a few seconds; a miss could cost a life.
- Guidance renders **above all other content** on the screen, and results are
  shown beneath it rather than suppressed.
- It routes to 911 (or 988 for self-harm) and never names a condition or a
  treatment.
- It is returned **even when MedlinePlus is down**, so a content outage can
  never swallow the instruction to call for help.

The phrase lists are signposting terms drawn from public emergency
warning-sign guidance. **They have not been reviewed by a clinician** — that
review is required before release.

The general "When to see a doctor" copy is intentionally non-specific.
Condition-specific criteria ("seek care if your fever exceeds X") would be
clinical content this app is not permitted to author.

## Emergency card (implemented)

A screen the user fills in once — allergies, known conditions, blood type, and
who to call — that is readable in one tap from the home screen and works with
no connection. `mobile/src/screens/emergency/`, backed by
`mobile/src/services/emergencyCard.ts`.

**This is not the emergency routing feature.** `app/core/emergency.py` screens
symptom text for red flags and is fenced; nothing here touches it, reads it,
or feeds it. The card is a place to write something down.

### ⛔ It is stored on the device and nowhere else

There is no endpoint, no table, and no `fetch` on this path — a test asserts
it. Two separate reasons, and both have to hold:

- **It has to work when nothing else does.** It is read by someone holding an
  unlocked phone in an emergency, who may have no signal and a backend that is
  down. Anything that needed a request would fail at the only moment it
  mattered.
- **The backend has no encryption at rest** (open finding 2). Allergies and
  conditions are among the most sensitive things this app could hold, so the
  safest place for new health data is a store the server never sees.

The cost is stated on the editor rather than hidden: the card does not follow
the user to another phone or browser, and there is no backup of it.

| | Store | Survives a reload | Survives the app or tab closing |
|---|---|---|---|
| `emergencyCardStorage.ts` (iOS/Android) | Keychain / Keystore, `WHEN_UNLOCKED_THIS_DEVICE_ONLY` | yes | yes |
| `emergencyCardStorage.web.ts` (browser) | `localStorage` | yes | **yes** |

⛔ **`localStorage` here is deliberate, and is not the rule `tokenStorage.web.ts`
sets.** That file forbids moving the *session token* to `localStorage`, and
that stands. The trade runs the other way for the card: a token is a bearer
credential whose right lifetime is the shortest one that survives a refresh,
while a card that vanishes when the tab closes is a card that is not there
when it is needed, and it grants nobody access to anything. Both halves are
asserted by tests so that "fixing the inconsistency" in either direction
fails the suite.

The exposure that buys is real and is written on the editor screen: **on a
shared or borrowed computer the card stays behind after sign-out**, and no
sign-out removes it. "Erase this card" is offered for exactly that.

### ⛔ Nothing on the card is authored, checked or interpreted by MedHelp

Every field is free text, stored verbatim and rendered verbatim. There is no
picker of conditions, no list of common allergies, and no validation of a
blood type — offering a menu of conditions would make MedHelp the author of a
clinical vocabulary, and checking a blood group would imply a verification
that has not happened.

Nothing reads the card either. It is not an input to triage, to the emergency
screening, or to anything else.

The header is loud enough to carry an authority the content has not earned, so
the screen disowns it in as many words: "MedHelp did not check them and cannot
confirm they are current."

### ⛔ An empty field renders as "Not provided", never as a missing row

The single most important rule on the screen. A card with no allergies row
reads as *no allergies* to whoever is holding the phone; the gap is
information and has to be visible. Asserted by a test.

### The medication list is mirrored to the device, and that is a second copy

Medications are what a responder would most want from this app and are already
collected — but behind an authenticated call, which is the one thing the card
cannot depend on. So `MedicationListScreen` writes an offline copy whenever it
loads, and the card reads that.

- **Name and dosage only**, of at most 25 medications, each field capped at 300
  characters. Not the prescribing doctor, not the notes, not the refill dates:
  none of that helps a responder, and every field left out cannot leak from
  here. The cap is also what keeps the record inside Android's SecureStore
  size limit (~2048 bytes), above which a write can be lost silently.
- It is a **real widening of where health data rests**, stated on the card and
  in the editor. `clearCard()` removes it along with everything else — a clear
  that left a medication list behind would not be a clear.
- The card says it may be out of date rather than presenting it as live.

### Why the palette breaks the house style

The rest of MedHelp is deliberately calm and this screen deliberately is not:
it is found under stress, possibly by someone who has never used the app, so
it is built to be identifiable at a glance. The header ground is
`colors.emergencyText` — an existing reviewed value from the emergency family,
used as a fill, which gives white text 10.8:1 where the lighter border colour
would give 5.3:1. **No token value was changed**, which is what the theme note
asks of anyone touching the safety-meaning families.

`EmergencyCardLink` (the home-screen entry) and `EmergencyCallBar` are
different components on purpose. The link opens a screen; the bar routes to
emergency services. Merging them would blur the one instruction that has to be
unambiguous.

### A lock-screen widget was considered and not built

Asked for as a "flag whether that's feasible, don't force it". It is not, here:

- iOS needs a **WidgetKit app extension in Swift**, an Expo config plugin, and
  a development build — and for distribution an Apple Developer account. This
  project deliberately went the other way (see the browser scanner: "so an
  iPhone needs no $99 account"), and there is no device or dev build in this
  environment to test one on.
- Android needs an App Widget or Quick Settings tile, likewise native and
  likewise a dev build.
- **Both platforms already ship a better version of this.** iOS Medical ID
  (Health app) is reachable from the lock screen's emergency dialler, and
  Android has Emergency information under Settings. A responder is trained to
  look there, not in a third-party app. Duplicating that badly is worse than
  not duplicating it.

If a widget is ever wanted, it should be scoped as native work alongside the
development build `expo-mlkit-ocr` already requires — not bolted on.

### Not reviewed, and PHI status

- **Not reviewed by a clinician.** Nothing here is clinical content, but which
  fields an emergency card should carry is a question a reviewer should answer.
- The card is health data about an identifiable person at rest on a device. On
  native it is in the platform keystore; **in a browser it is unencrypted
  `localStorage`**. That is a new instance of open finding 2 rather than an
  exception to it.

## Medication label scanning (implemented)

A user can photograph a prescription label instead of typing the medication in.
Manual entry is unchanged and remains the primary path.

**The OCR runs on the device.** Apple Vision on iOS, Google ML Kit Text
Recognition v2 on Android, both via `expo-mlkit-ocr`. This was a data-handling
decision before it was an engineering one:

- A prescription label carries the patient's name, address, prescriber,
  pharmacy, Rx number, drug and dose **in one photograph**. It is about the
  most identifying artefact a user could hand this app.
- Sending it to a cloud OCR service (Google Cloud Vision, AWS Textract, Azure
  AI Vision) would make that vendor a processor of PHI and require a signed
  BAA. All three will sign one; **this project has none with anyone**, and
  procuring one is a legal decision, not an engineering one.
- On-device recognition means **no BAA question arises at all**: no image and
  no recognised text leaves the phone. `app/services/labelScanner.ts` makes no
  network call, which is a property you can verify by reading it, and a test
  asserts `fetch` is never called during a read.
- The cost is accuracy on hard photographs — curled labels on round bottles,
  low light, worn thermal print. Cloud OCR is better at those. That is the
  trade, and it is why every read is confirmed by the user rather than trusted.
- It needs a **development build**; `expo-mlkit-ocr` does not run in Expo Go.
  When the native module is absent the feature reports itself unavailable and
  the user is sent to manual entry.

### Two engines, one parser

Recognition is platform-split; everything above it is shared.

| | Engine | Network |
|---|---|---|
| `labelScanner.ts` (iOS/Android) | Apple Vision / ML Kit v2 | **none at all** |
| `labelScanner.web.ts` (browser) | Tesseract (WebAssembly) | fetches its model |

Metro resolves the `.web.ts` variant automatically. Both expose the same
functions, throw the same `ScanError`s from `scanErrors.ts`, and return the
same `ParsedLabel` from the same parser, so a label reads identically wherever
it is scanned and `MedicationScanScreen` needs no platform knowledge.

The web engine exists because a browser cannot reach Apple Vision or ML Kit —
they are OS frameworks. It is what makes scanning work on an iPhone through
Safari with no App Store, no development build and no Apple Developer account.

**State the privacy property precisely, because it differs.** On both paths the
photograph never leaves the device: it is handed straight to on-device code and
the recognised text is discarded after parsing. But the native path makes *no
network call whatsoever*, while Tesseract downloads its WASM core and English
training data from a CDN on first use. What travels is the model coming down,
never the image going up — so no PHI is transmitted and no BAA question arises
— but do not copy "makes no network call" onto the web file. If even the model
fetch becomes unacceptable, the assets can be self-hosted by pointing
`workerPath`/`corePath`/`langPath` at our own origin; that is a deployment
change, not a code change.

Tesseract is meaningfully worse than the native engines on curled, dim or worn
labels. Since every read is confirmed by the user before saving, a weaker
engine costs accuracy and patience, not safety.

Rules for anyone extending this:

- **Nothing scanned is ever saved without the user confirming it on screen.**
  The scan screen cannot write a medication; every path out of it opens the
  ordinary form, prefilled, and the user presses the same save button as
  someone who typed it in. A misread dose that saved itself would change when
  a person takes a medication with nobody having looked at it. Tests assert
  this on both screens.
- **Directions are carried across verbatim.** `labelParser.ts` copies the sig
  line as printed and does not expand BID/TID/QHS or reword anything.
  Decoding an abbreviation into dosing instructions would be app-authored
  clinical content, and a wrong expansion changes medication timing. Same rule
  as the MedlinePlus verbatim requirement above.
- **Doses are never restated or converted.** "250 mg/5 mL" stays a
  concentration. Only spacing and unit capitalisation are tidied.
- **Drug names are never corrected against a dictionary.** A misread name
  stays misread so the user can see it is wrong. Snapping OCR output to the
  nearest real drug turns a legible mistake into a plausible one.
- **Only the four fields the form already stores are extracted.** The
  patient's name, address and Rx number are deliberately not read out — the
  app has no field for them, and the raw OCR text is discarded inside
  `readLabel` rather than returned to any screen.
- A failed or low-confidence read **falls back to manual entry with whatever
  was extracted prefilled**, never to a dead end.
- Parser accuracy is measured over **whole labels**, not one string at a time
  (`mobile/__tests__/labelParserCorpus.test.ts`, synthetic layouts only). Two
  defects it found, both of which corrupted a field rather than failing to
  read it:
  - `"100 UNITS/ML"` came back as a dosage of `"100 units"` and a drug name of
    `"Insulin Glargine ML"`. The strength pattern required a number after the
    slash, and a concentration printed per one millilitre does not write the
    1 — so the denominator was dropped from the dose and the orphaned `/ML`
    was read as part of the name. Dropping a denominator restates a dose,
    which is the thing this parser is forbidden to do.
  - `"LISINOPRIL-HCTZ"` came back as `"Lisinopril-Hctz"`. De-shouting block
    capitals treated any all-caps run over three letters as a word; an
    all-caps token with no vowel is now left as printed, so `HCL`, `HCTZ` and
    `SMZ` survive.

  Neither fix reads a dictionary or asks what any letters stand for. The
  corpus tests layout, not recognition — OCR quality belongs to the engine and
  cannot be measured without real photographs.

Not yet reviewed by a clinician or by counsel. Scanning does not estimate
urgency and authors no clinical content, so it is not covered by the intake
blocker below — but the parsing heuristics have only been tested against
synthetic labels written by an engineer, not against a corpus of real ones.

## Medication reminders (implemented)

A user can set daily times for a medication and be notified at each one. The
times come from a suggestion the user confirms; nothing schedules itself.

### ⛔ MedHelp proposes times. It never sets them.

`frequency` is the sig line, carried **verbatim** from the label. Turning
"TAKE 1 TABLET BY MOUTH TWICE DAILY" or "BID" into two alarms is a decode of
dosing instructions — the exact thing the verbatim rule under "Medication
label scanning" forbids, because a wrong expansion changes when someone takes
a medicine.

So the feature is built as read-then-confirm, the same shape as the scanner:

- `backend/app/services/dose_schedule.py` proposes times. It is an explicit,
  readable phrase list a clinician can check line by line — not a model, not a
  general parser.
- `GET /reminders/medications/{id}/suggestion` returns that proposal and
  **writes nothing**. A test asserts a suggestion leaves the user with no
  reminders.
- `ReminderEditScreen` shows the proposal as an editable draft with the
  printed directions **unedited beside it**, so the user compares the times
  against the label rather than trusting the app. Reminders exist only after
  they press save.
- The default clock times (08:00/20:00 and so on) are **neutral waking-hours
  conveniences, not clinical choices**. Which hours suit depends on the
  person, the drug, and instructions this app never sees. The UI says so.

**It declines far more readily than it guesses.** Anything not on the lists
returns no suggestion and a reason the user is shown, and they set their own
times. Deliberately refused:

- **"As needed" / PRN.** Recognised only in order to refuse it. An as-needed
  label often carries an interval ("every 6 hours as needed"), but that is a
  *maximum*, not a schedule — an alarm built from it would tell someone to
  take a medicine they may not need. This is the most important refusal here.
- **Anything not a daily rhythm** — weekly, every other day, cycled courses.
- **Food and route qualifiers** ("with food") are left in the verbatim text,
  never turned into mealtimes. MedHelp does not know when anyone eats.

Times are rejected, never reinterpreted: `8am`, `0800` and `8:00` are refused
rather than guessed, because "8" could be either end of the day.

### Delivery differs by platform, and the difference is stated to the user

| | Engine | Fires with the app closed |
|---|---|---|
| `notificationService.ts` (iOS/Android) | `expo-notifications`, daily local trigger | **yes** — the OS holds it |
| `notificationService.web.ts` (browser) | `setTimeout` + the Notification API | **no** — only while the tab is open |

Metro picks the variant; both export the same functions, so the screens are
platform-agnostic. The reminders screen renders the web limitation as a
standing notice rather than letting someone assume an alarm clock.

- ⛔ **These are local notifications only.** No push token is requested and
  nothing is registered with Expo's push service, FCM or APNs. **Do not add
  `getExpoPushTokenAsync` or Web Push without a BAA decision** — a payload
  naming a person's medication makes those services processors of PHI. Web
  Push was considered for background delivery on the web and rejected on
  exactly that ground; it would also need HTTPS, so it cannot work on the LAN
  address the app is served from today.
- Nothing about a reminder leaves the device. Both services make no network
  call; a test asserts `fetch` is never called when one fires.
- ⛔ **Never ask for notification permission without a user gesture.** Same
  rule, and same reason, as location: an unprompted request is suppressed by
  browsers and a blocked site never prompts again. `getPermission()` only
  reads what is already granted; a button is the only thing that asks.
- The **on-screen list is the part that is always correct**, and the
  notification is the bonus on top. That is why the screen shows today's times
  and their state on open.

### Rules for anyone extending this

- **A reminder time is a local wall-clock "HH:MM", never a UTC instant.**
  Eight in the morning means eight in the morning wherever the person is;
  converting through a timezone would move a medication time when they travel.
- **This is not an adherence record.** A time that has gone by shows as
  "earlier today", never "missed" — MedHelp has no idea whether the dose was
  taken, and implying otherwise invents a clinical fact about the user.
  Nothing here tracks, scores, or reports adherence.
- **Deleting a medication deletes its reminders**, in the endpoint as well as
  by foreign key. A leftover row is not untidy data, it is an alarm telling
  someone to take a medication they have stopped. SQLite does not enforce the
  cascade, so the test asserts against the table, not the listing.
- `medication_reminders` stores no medication name — it joins for that. A
  second copy would be a second place health data leaks from.
- The notification body names the medication, because one that will not say
  what to take is no use. **That makes it visible on a lock screen** to anyone
  nearby. Accepted for now; if that becomes unacceptable the body can be made
  generic, which is a copy change in one place per platform.

### Refill alerts: when a supply is estimated to run out

Built on the existing `medications` record rather than beside it. Three
nullable columns were added — `quantity_remaining`, `quantity_counted_on`,
`doses_per_day` — and the estimate is derived server-side in
`backend/app/services/refill_forecast.py`.

**`refill_date` and `refill_estimate` are two different claims and must stay
apart.** `refill_date` is a date the user wrote down; the estimate is
arithmetic MedHelp did. They have separate fields, separate badges, separate
wording, and separate lead times. ⛔ Do not collapse them — a guess that
inherits a record's authority is exactly the failure this app is built to
avoid elsewhere.

#### ⛔ The directions line is never read

`forecast()` **does not take a `frequency` argument at all**, and
`refill_forecast.py` does not import `dose_schedule`. Both are asserted by
tests, against the function signature and the module's import statements,
so adding one is a failing suite rather than a quiet change of policy.

Reading a dose count out of "TAKE 1 TABLET BY MOUTH TWICE DAILY" is the decode
the verbatim rule forbids, for the same reason it forbids expanding BID into
two alarms: a wrong expansion changes when someone takes a medicine.

So `doses_per_day` comes from one of two places, in this order:

1. **A number the user typed** on the medication form (`"entered"`).
2. **The count of their enabled reminder times** (`"reminders"`). Those rows
   exist only because someone reviewed a draft and pressed save, so counting
   them adds no guess of MedHelp's own.

With neither, there is no estimate and the user is told which half is missing.
`doses_per_day_source` is returned so the screen can show what the estimate
rests on rather than handing over a date with no provenance.

#### ⛔ It is an estimate, and every surface says so

`is_estimate` is a property that cannot be constructed false, and it is true
whenever there is a date at all. The projection assumes **every dose is taken
exactly on schedule**, which MedHelp has no way to check — CLAUDE.md is
explicit that this is not an adherence record, and `reminderTiming.dueState`
already says "earlier today" rather than "missed" for the same reason.

Tests assert the wording on the card badge and in the notification body, and
assert that neither says "missed", "skipped" or "forgot".

#### Declining is a normal outcome

No quantity, no confirmed doses-per-day, a count dated in the future, or more
than a year's supply: each returns no date and a reason meant for the user.
A confident wrong run-out date is worse than none for someone deciding whether
to chase a prescription.

`quantity_counted_on` is what stops a count going stale silently — "30 left"
means nothing without the day it was true, and a projection with no origin
would report the same answer forever. The API fills it with today when a
quantity arrives without one.

Nothing rounds up: seven tablets at two a day is three whole days, not four.

#### The lead time is a device setting, not an account one

Default 3 days, choosable from the reminders screen (1/3/5/7/14).
`appSettings.ts` keeps it in `deviceStorage`, and it travels to the API as
`GET /medications?refill_lead_days=N`.

There is no user-settings table, and adding one for this would put a row about
a named person's medication habits into a database with no encryption at rest
— for a number that only ever changes when a notification fires on that
device. The consequence is that each device keeps its own.

The **arithmetic still happens server-side**, which is what keeps the
medication list and the reminders screen flagging the same medications.

#### Both kinds of notification are armed in one call

`scheduleAll(reminders, { refillAlerts })`, from `MedicationRemindersScreen`
and nowhere else.

⛔ They cannot be armed separately. `cancelAll()` clears everything — on native
it calls `cancelAllScheduledNotificationsAsync`, which does not distinguish
between them — so two arming functions would take turns cancelling each
other's work. The symptom would be a notification type that silently stopped
firing depending on which screen was opened last. A test asserts both survive
one call.

| | Trigger | Repeats |
|---|---|---|
| Dose reminder | daily, at a wall-clock time | yes, every day |
| Refill alert | a one-off calendar date at 09:00 local | **no** |

A refill alert is about one estimated date; repeating it would nag about a
supply the user may already have replaced.

The run-out date is parsed as **local midnight, not UTC**.
`new Date("2026-09-18")` is UTC by specification, which is the previous
evening anywhere west of Greenwich and would move the alert a day for most of
the Americas. Tested.

An alert whose moment has passed is not scheduled at all — a notification
cannot fire into the past, and re-firing one on every screen load would be
worse than not firing it. The **badge on the medication list is the part that
is always correct**, the same division of labour the reminders screen already
relies on. On the web the setTimeout ceiling (~24 days) also applies, and a
refill alert is days out, so it misses far more often than a dose reminder
does.

#### ⛔ Deploying this needs a hand-run script

The three columns went onto a table that already exists, and the start command
runs `create_missing_tables.py`, which creates missing tables and never alters
existing ones. Run `scripts/add_medication_supply_columns.py` once against any
database created before this change, or `/medications` returns 500s. It is
idempotent. This is the "a column added to an existing model still needs a
hand-written script" case the deployment section already warns about.

#### Not reviewed, and PHI status

- **Not reviewed by a clinician.** Whether a three-day default is the right
  lead time, and whether a supply projection should be shown at all, belong in
  the same review as the `dose_schedule.py` phrase lists.
- `quantity_remaining` and `doses_per_day` say how much of a named medicine a
  named person has and how often they take it. **Not encrypted at rest** — the
  same open finding as the rest of `medications`.

### Not reviewed, and PHI status

- **Not reviewed by a clinician.** The phrase lists in `dose_schedule.py` and
  the default hours are a software engineer's construction and belong in the
  same review as the intake instrument.
- `medication_reminders` rows say that a named person takes a named medicine
  at a named hour. **Not encrypted at rest** — the same open finding as
  `medications`, `intake_assessments` and `appointments.reason_for_visit`.
- The native path is **untested on a device**: there is no development build
  or hardware here, so it is written against the documented API and unit
  tested against a mock, never observed firing. The web path has been checked
  end to end, including a notification firing at the armed minute.

## Appointments and provider search (implemented)

A user can search a real provider directory, open a provider, and record an
appointment. The record lands in the appointment list, which is the same
feature the URGENT tier of symptom intake now routes into.

**MedHelp does not book appointments, and must not say it does.**

Research and the full option analysis: `docs/appointment-booking.md`. The short
version: every API that can actually place a booking (Zocdoc, Epic-hosted
scheduling, athenahealth) needs a signed partnership, provider-side opt-in and
a BAA. This project has none of the three. So the transmission step is absent
and labelled absent, rather than mocked.

- **The directory is real.** NPPES, published by CMS
  (`app/services/provider_directory.py`). Free, no key. It is authoritative for
  who providers are and where they practise.
- **Availability is not shown, because no source for it exists.** NPPES
  publishes none. `Provider` has no slot field, the API response has no slot
  field, and tests assert both. A "next available" time in this app would be
  invented, and someone would turn up for an appointment that does not exist.
- **Creating an appointment contacts nobody.** It writes a row. The provider
  has never heard of it. Three screens say so, and
  `app/services/request_delivery.py` raises rather than quietly succeeding.
- **`provider_notified` is the single source of truth** for whether anyone was
  contacted, and is never inferred from `status` — a user can mark a row
  SCHEDULED because they rang the clinic themselves.

Rules for anyone extending this:

- **Do not add a slot picker, a "Book now" button, or a time, until a real
  scheduling integration exists behind it.** The UI reads
  `online_booking_available` from the API; drive any new affordance off that
  flag rather than off an assumption in a component.
- **Hospitals are searchable, because a hospital is a setting.** NPPES
  enumerates them under `General Acute Care Hospital`. The list previously held
  only physician specialties, so "find me a hospital" was simply not possible —
  "Emergency medicine" is the doctor, not the building. NPPES also enumerates
  *individuals* under that taxonomy, so a result can be a clinician who
  practises at a hospital rather than the hospital itself; that is the source's
  own classification and is left alone, because relabelling or filtering it
  would assert something about a provider the directory does not say.
- **The provider search must never carry health information.** It sends a
  5-digit ZIP and a care *setting* from the fixed `CARE_SETTINGS` list. A
  free-text specialty is rejected on purpose: "Urgent Care" in a CMS query log
  says nothing about the person searching, "Oncology" would. A test asserts the
  outbound parameter set. This is why NLM's BAA question does not arise for
  this vendor.
- **MedHelp does not rank or recommend providers.** Results are sorted by
  distance only, and the screen says the app cannot tell you who is accepting
  patients, open now, or in network. Ordering providers on clinical grounds
  would be a judgement this app may not make — the same rule as the
  MedlinePlus topic filter.
- Distance is a **straight line from the centre of the searched ZIP to the
  provider's street address**, computed by the backend, and is always rendered
  with a "~". It is not a driving distance. See "How a distance is worked out"
  below. The user's own coordinates never leave the phone on iOS/Android and
  reach only MedHelp's backend on web; only the 5-digit ZIP is passed to the
  search.
- Location is **optional everywhere**. `expo-location` needs a development
  build, permission can be refused, and both degrade to the user typing a ZIP.
- **Location works on both platforms, by different routes.** One function
  differs; everything above it is shared.

  | | Position from | ZIP from | Coordinates go |
  |---|---|---|---|
  | `locationService.ts` (iOS/Android) | `expo-location` | the OS geocoder | nowhere |
  | `locationService.web.ts` (browser) | `navigator.geolocation` | `POST /providers/resolve-location` | MedHelp's backend only |

  Metro picks the variant. Both export the same `getPostalCode()` returning the
  same `LocationLookup`, so `ProviderSearchScreen`, `providerService`,
  `apiClient` and every screen are shared and platform-agnostic.

  The split exists because **a browser has no geocoder** — `expo-location`
  throws `E_NO_GEOCODER` from `geocodeAsync`/`reverseGeocodeAsync` on web, and
  there is no browser equivalent. Since the directory is searched by ZIP, a
  coordinate alone is useless, which is why the web build once could not use
  location at all.

  **State the privacy property precisely, because it differs.** On iOS and
  Android the coordinates never leave the phone. On web they reach MedHelp's
  own backend — as a POST body, so they stay out of URLs and access logs — and
  are resolved and discarded, never stored, never forwarded. **No third-party
  geocoder is used on either platform**, and a test asserts no request goes to
  one. Do not copy "coordinates never leave the phone" onto the web file.

  Resolution uses a committed extract of the US Census ZCTA Gazetteer (public
  domain) — `app/services/zip_geography.py`, rebuilt by
  `scripts/build_zip_centroids.py`. This is the "license a redistributable
  dataset and serve it locally" option named above, chosen over a geocoding API
  precisely so no vendor becomes a processor of a health app's location data.

- ⛔ **Never ask for location without a user gesture.** `getPostalCode()` only
  uses a permission that has *already* been granted; it reports `"prompt"`
  otherwise, and the screen turns that into a "Use my location" button.
  `getPostalCode({ prompt: true })` is the only thing that asks, and only a
  button press calls it.
  - This was a real bug, reported as "I never get prompted". Requesting on
    mount is suppressed by browsers that require a gesture, and once a site is
    blocked it never prompts again — so nothing appeared, with no way to retry
    from inside the app. A button guarantees the gesture and gives a second
    chance after unblocking, without a reload.
  - `"prompt"` gets **no** notice. It is not a failure; the button is the
    thing to press. Only real outcomes (`denied`, `timeout`, `unavailable`,
    `insecure`) get a message.
  - Both platforms check first without asking — `navigator.permissions.query`
    on web, `getForegroundPermissionsAsync` on native. An already-granted
    permission still fills the ZIP in silently on arrival, so the common case
    costs no extra tap.

- ⛔ **Geolocation needs a secure context, and a LAN address is not one.**
  Browsers expose the Geolocation API only over https or on `localhost`. Served
  to a phone at `http://192.168.x.x` — which is how you run this without an
  Apple developer account — the API is refused **no matter what the user
  chooses**. Verified, not assumed: the e2e run grants permission explicitly
  and Chrome still returns `PERMISSION_DENIED`.
  - Chrome reports it as ordinary permission denial, so the client checks
    `window.isSecureContext` *first* and reports `insecure` instead. Without
    that, a LAN user is told they refused a permission they were never asked
    for, and given no way forward.
  - **Typing a ZIP is a first-class path, not a fallback.** It is the only path
    on LAN http, and browsers refuse location far more often than phones do.
    Every failure mode names what happened and what to do instead.

### How a distance is worked out

**Computed by the backend**, not the device (`app/services/provider_geo.py`,
returned as `distance_miles` on each row). They used to be worked out on the
phone from the OS geocoder, which meant the web build showed none at all and a
twenty-row result cost twenty geocoder lookups.

The two ends of the measurement are answered differently, and the difference
is the whole design:

| | Source | Resolution |
|---|---|---|
| The user's end | centroid of the ZIP they searched (`zip_geography`) | one ZIP code |
| The provider's end | their street address, geocoded (`address_geocoder`) | a street address |

- ⛔ **The provider end used to be a ZIP centroid too, and that was a bug users
  saw.** Centroid-to-centroid has **no resolution below one ZIP code**, and
  `search_providers` queries NPPES by the exact ZIP first — so most results sat
  *in* the searched ZIP, and a ZIP's centroid is zero miles from itself. A real
  search of Las Vegas 89109 returned five of six providers at "~0.0 mi", for
  clinics up to three miles apart. The number was not merely imprecise: it was
  the same number for everyone, so it could not be used to choose between them.
  The same search now returns 0.4, 1.6, 1.9, 2.5 and 2.9 miles.
- **The user's end is deliberately still a ZIP centroid.** They typed a ZIP, or
  their coordinate was reduced to one. The honest reading of "~2.5 mi" is
  therefore *"about two and a half miles from the middle of your ZIP code"* —
  close to the truth in a dense urban ZIP, loose in a large rural one. **Keep
  the "~"**, and do not describe these as distances from the user.
- **A zero is never shown.** Where a provider cannot be placed and the ZIP
  estimate would be zero (same ZIP), the answer is `None`, which the client
  already renders as no distance at all. "~0.0 mi" reads as "next door" for a
  clinic that may be three miles away, and `zip_geography` already records that
  a wrong distance is worse than an absent one for someone deciding how far to
  travel while unwell.
- **Failure costs accuracy, never results.** The providers are already fetched
  by the time geocoding runs. An outage, an unplaceable address or an unknown
  ZIP falls back to the centroid estimate; nothing here may fail a search.
- Results are still ordered by distance only, and providers with no distance
  sink to the bottom rather than being dropped.

### Third-party vendor: US Census Bureau geocoder — BAA status

`app/services/address_geocoder.py` sends provider street addresses to
`geocoding.geo.census.gov`. Free, public domain, no key — the same class of
source as NPPES itself. **Flagged here because CLAUDE.md requires any new
third-party service to be named rather than assumed handled.**

- **No user data is transmitted, so no BAA question arises.** The upload is
  id / street / city / state / ZIP, all of it already published by CMS about
  the clinic, plus a pinned benchmark. There is no field on this call that
  could hold a symptom, a tier, an identity or a user location — and a test
  asserts the outbound column set.
- **Do not confuse this with the user's location.** The statement elsewhere in
  this file that *no third-party geocoder is used* is about **the user's
  coordinates**, and remains true: those are still resolved locally against the
  committed Census dataset in `zip_geography`, on both platforms. This vendor
  only ever sees providers' public business addresses.
- What a request does reveal is **which area was searched**, since the
  addresses in one batch share a locality. That is why answers are cached by
  NPI in `provider_locations`: a provider's address does not move, so the same
  area is not re-queried on every search. A warm cache makes zero requests.
- `provider_locations` **has no user column and must never gain one.** Adding
  a `user_id`, or a note of who looked, would turn a table of public addresses
  into a log of which clinics a named person was looking for — health data
  about them. A test asserts the column set.
- It is a batch endpoint: **one request covers a whole page of results**, not
  one per provider.

- **There is no map, on any platform.** Results are a list. Nothing imports
  `react-native-maps` or a JS maps SDK, so there is no native-map-to-web-map
  swap to make. Adding one would need a keyed tile vendor and its own privacy
  review.

- Real-browser coverage lives in `mobile/e2e/web-provider-search.mjs`
  (`npm run e2e:web`). It drives actual Chrome against a real backend and the
  live directory, because secure-context rules and permission prompts cannot be
  observed in jsdom or in devtools' responsive mode. Not part of `npm test`.

### The URGENT tier routes here

`IntakeResultScreen` previously sent URGENT users to their maps app. It now
navigates in-app to provider search, carrying the description forward as the
reason for visit so nobody retypes their symptoms into a second form. The
description is prefilled and **editable** — it was written to answer a triage
question, not to tell a receptionist why you are coming in.

⛔ That block is on a screen this file fences. It changes no disclaimer, no
escalation copy, and no triage or emergency module, and the EMERGENT tier's
routing is untouched. But it changes what an URGENT reader is offered at the
moment they are told to seek care, so **it belongs in the clinical reviewer's
read of that screen** rather than being treated as ordinary UI work.

`urgency_tier` is stored on the appointment as a **label only**. Nothing
re-derives urgency from it, and nothing in this feature may touch the triage
layer.

### Patient identity is pass-through, and must stay that way

A scheduling API cannot book without identifying the patient to the clinic:
legal name, date of birth, sex assigned at birth, phone, email, home address.
MedHelp's answer is **pass-through** — those fields are built from one request,
handed to the delivery layer, and dropped. `app/schemas/booking_identity.py`
is the only place they exist.

The user retypes them per booking. That is the accepted cost of not holding a
table of names, dates of birth and home addresses in a database with no
encryption at rest.

Rules, each asserted by a test in `tests/test_booking_identity.py`:

1. **`appointments` has no column that could hold an identity field**, and
   `BookingIdentity` is not a SQLAlchemy model. The test checks the mapped
   table, so a column added by any route is caught — including near-misses
   like `patient_name` or `dob`.
2. **`AppointmentOut` never carries identity.** Echoing it back would put a
   date of birth into client logs and crash reporters, which is most of the
   exposure that not storing it avoids.
3. **`BookingIdentity.__repr__` is redacted.** pydantic's default prints every
   field, so an identity in a stack frame would leak a name and home address
   into any traceback or `logger.exception` that touched it.
4. **Never put one in a React Navigation param.** Route state is serialisable
   and dev tooling persists it, so a date of birth in a param is a date of
   birth written to disk. The identity screen takes an appointment **id**.
5. **A rejected identity is not echoed back.** The `RequestValidationError`
   handler in `app/main.py` strips the submitted value — it matters more here
   than anywhere else in the app.

**Pass-through is not the same as "not liable."** Transmitting this to a vendor
makes them a processor of PHI just as surely as storing it would. It shrinks
the breach radius; it does not remove the BAA requirement.

### The booking path is built, gated, and unreachable

`POST /appointments/{id}/submit` and `BookingIdentityScreen` exist so the path
is reviewed and tested before the pressure of a live integration — not so it
can collect anything now.

- `delivery_available()` returns False, so the endpoint returns **503 before it
  processes an identity**, and `GET /appointments/capabilities` reports
  `online_booking: false`.
- The app reads that capability and never renders the identity form. **No
  date of birth or home address is collected today.**
- ⛔ **Do not flip `delivery_available()` to unlock the UI.** It is not a
  feature flag; it stands for a signed BAA and a scheduling partnership. Making
  it return True starts transmitting PHI to a vendor with no agreement in place.

### Not reviewed, and PHI status

- Not reviewed by a clinician or by counsel. Provider search authors no
  clinical content and estimates no urgency, so it is not covered by the intake
  blocker — but the URGENT hand-off above is.
- `appointments.reason_for_visit` is free text about someone's symptoms, and in
  the intake flow it is a copy of the intake description. It is **not encrypted
  at rest**, the same open finding as `medications` and `intake_assessments`.
- Real booking would require MedHelp to hold legal name, date of birth, sex
  assigned at birth and address. It holds none of those today, and acquiring
  them is a decision for the user, not an implementation detail.

### Natural phrasing missed by literal phrase matching (FIXED 2026-09-06/07)

Found by testing the rule layer against ~50 lay descriptions of common
American illnesses (an ad-hoc exercise, not a permanent test corpus). Two
gaps, both the same root cause as the glued-list bug below: the phrase lists
in `emergency.py` and `rules_triage.py` require an exact literal substring, so
an ordinary insertion a real person types defeats a match that a slightly
different sentence would have hit.

- **Emergency screening missed common phrasings of anaphylaxis, breathing
  difficulty, sudden vision loss, and cardiac chest tightness.** `"my throat
  is closing and my tongue is swelling"` (anaphylaxis), `"hard time
  breathing"` / `"can't catch my breath"` (breathing), `"suddenly lost vision
  in my left eye"` (vision_loss), and `"chest feels tight"` (cardiac) all
  matched **nothing** and fell to the URGENT default instead of EMERGENT —
  the exact "not recognised is not the same as harmless" failure mode this
  file warns about, but on genuinely life-threatening presentations.
  **Fixed** by adding the missing phrasings to the existing lists in
  `_EMERGENCY_RULES`. `sepsis_meningitis` got a partial fix only (`"stiff neck
  with/and a fever"` variants); `"my neck is stiff and I have a fever"` — the
  two concepts named separately, in reverse order — is a **known limit**,
  same class as the all-caps glued-list limit below: catching it needs a
  two-term combinator, which is a structural change beyond a phrase-list
  addition and needs its own review.
- **A duration-escalation rule silently broke on the word "over."**
  `"sore throat for a week"` correctly returned URGENT, but `"sore throat for
  over a week"` — or `"sore throat for over two weeks, swollen glands,
  extremely tired"`, a plausible mono description — returned **SELF_CARE**,
  because `"for a week"` requires that exact substring and `"for over a
  week"` does not contain it. This directly undercut the module's own central
  invariant ("SELF_CARE must be positively earned... absence of alarming
  words is not evidence of safety"). **Fixed** by adding `"for over a
  week"`/`"for over two weeks"`/`"for over a month"` and `"for more than
  ..."` variants to `_URGENT_RULES`' `persistent_or_worsening` phrases, and
  bringing `_ESCALATING_MODIFIERS` back in sync with it (it was also missing
  `"for two weeks"` and `"for several days"`, which were already in the
  urgent list).
- ⛔ **Both edits were made to fenced modules** (`rules_triage.py`,
  `emergency.py`). They landed only after the user was told the specific
  bugs and specific proposed phrase additions in conversation and replied
  "fix it" — the same "explicit human approval obtained outside of this
  pipeline" basis the glued-list fix below records. Neither change lowers a
  tier, reorders evaluation, or touches a disclaimer, an emergency number, or
  escalation copy; both only add recognised phrases, which can make screening
  more sensitive and cannot make it less. `tests/test_emergency.py` and
  `tests/test_rules_triage.py` guard the new phrasings; full suite (598
  tests) passes.

### Glued list items used to defeat red-flag screening (FIXED 2026-09-01)

Found from a real dev submission. A pasted list whose items arrive with no
separator between them — "Chest pain" + "Shortness of breath" becoming
`"Chest painShortness of breath"` — matches **nothing**, because every phrase
in `emergency.py` and `rules_triage.py` is compiled with word boundaries.

- The consequence is not cosmetic. An emergency description is not recognised,
  gets no 911 guidance, and falls to the URGENT default instead of EMERGENT.
- The case that surfaced it was harmless — a pasted list of cold symptoms
  arriving as `"Runny or stuffy noseScratchy or sore throatMild cough"`, which
  matched none of `runny nose`, `sore throat` or `mild cough` and so was
  classified URGENT by the default rather than SELF_CARE by the rules. **The
  same glue on a cardiac description is not harmless.**
- **Fixed in `normalize_query`** (`app/core/emergency.py`): a space is
  inserted at a lowercase-to-uppercase boundary before matching. It can only
  make screening *more* sensitive — it splits words apart and never joins them
  — so it cannot itself cause a miss.
- ⛔ **This edit was made to a fenced module.** It landed only after the user
  approved it directly in conversation, which is the "explicit human approval
  obtained outside of this pipeline" that the fence requires. No agent may
  repeat this on its own authority. `tests/test_emergency.py` now guards the
  behaviour, so removing the split fails the suite.
- **Known limit:** a list glued together in all capitals ("CHEST PAINSHORTNESS
  OF BREATH") has no case boundary to split on and is still missed.
- Second-order effect, and the reason the reported case is fully resolved: the
  rules now *recognise* the pasted cold rather than defaulting on it, so
  `is_needed` no longer asks the clarifying questions at all. The description
  returns SELF_CARE immediately, with no questionnaire.

Related, and for the same reviewer: **the follow-up questions can manufacture
an escalation.** `merge` folds answers into the description on purpose, so
that an answer carrying a red flag escalates like volunteered text would. But
`_ESCALATING_MODIFIERS` contains "sudden"/"suddenly", and round two asks "How
did it start?" with **"Suddenly" as a listed choice**. A recognised
self-limiting complaint therefore becomes URGENT whenever the user picks that
option — the questionnaire supplies the modifier that overrides its own
self-care match. Over-triage is the intended direction, so this is not a bug
in the safety model; but a reviewer should decide whether an answer the app
offered should carry the same weight as a phrase the user volunteered.

The window for this is narrow, and worth stating so it is not over-read: the
questions are only asked when the rules recognised nothing, and in that case
the tier is already URGENT by default, so "Suddenly" usually changes nothing.
It bites only where round-one answers bring a self-care phrase into a
description that had none, and round two then takes it back out.

## Health goals (implemented)

A person writes down a goal, confirms the plan and daily schedule MedHelp
proposes for it, and ticks the activities off. Reasoning and the reviewer's
open questions: `docs/health-goals-prompt.md`.

### ⛔ The blocking was removed on 2026-09-12. Read this first.

**MedHelp now proposes a plan for any goal a person types, including a medical
one, and no deterministic check screens what it proposes.** Two things were
deleted at the repository owner's direct request, asked for in conversation on
2026-09-12 — "remove the feature that blocks health plans and make it so the
section creates a plan and daily schedule for the health goal the user
inputs":

- **The `MEDICAL_GOAL` refusal**, and `WOULD_REQUIRE_AUTHORING` with it. These
  were how "lose weight", "stop my headaches" and "get my blood pressure down"
  reached the person as a refusal instead of a plan: `structure` ran first,
  and a `MEDICAL_GOAL` answer short-circuited before the planner was called.
  The order is now the plain one — the planner runs first, for everything.
- **`_FORBIDDEN`**, the phrase-list veto in `core/goal_structuring.py`. It
  held "calorie", "weight", "blood pressure", "dose", "hiit" and about sixty
  more, and one match anywhere discarded the *whole* plan. It is what made a
  health goal unanswerable in practice, because the goal could not be planned
  for without using the words it watched for.

⛔ **Be clear-eyed about the cost rather than reassured by what is left.** The
only thing now constraining an authored plan is `PLAN_SYSTEM_PROMPT`. A prompt
is an instruction that is usually followed; a phrase list was a check that
always ran. A prompt fails open and silently. This is a materially weaker
position than the one this file described before, and it was chosen
deliberately — not arrived at by drift.

Two tests pin the removal so it cannot be quietly undone
(`test_the_codes_that_blocked_a_health_goal_are_gone`,
`test_the_forbidden_phrase_veto_is_gone`). Reinstating either is a failing
suite and a conversation, not a tidy-up.

### What still holds, and may not be removed

1. **Every suggestion is labelled and confirmed.** `generated=True` reaches
   the screen, the row reads "Suggested by MedHelp — edit it or remove it",
   and editing a row's text clears the label because it has become the
   person's own. Nothing is saved until they press save. ⛔ Never render a
   suggested row without that label.
2. **No benefit claims.** `PLAN_SYSTEM_PROMPT` still forbids explaining what
   an activity will do for the person — propose the activity and stop.
   "Walk after lunch", never "walk after lunch to bring your blood sugar
   down". A benefit claim is the app authoring a health claim, which is the
   line this feature is still built around, and it is the easiest one to
   break now that the veto is gone.
3. **Still no medication or clinical targets.** The prompt refuses a dose, a
   supplement, a change to anything prescribed, and a target figure for a
   weight, blood pressure, blood sugar or calorie count. These are a
   clinician's call, and refusing them is not the same as refusing to plan.
4. **Emergency screening runs first and is untouched.** `api/goals.py` calls
   `screen_for_emergency` before the model, and its guidance is returned
   alongside whatever else happened.
5. **The `structure` fallback is unchanged**, checks and all. Where the
   planner fails, the person's own quoted words come back rather than an
   empty editor — the same rule as a model outage in triage never being
   SELF_CARE.

**Their own words are the fallback, not the main path.** `structure` still
reads quotable activities out of the text and every row it produces must quote
them — the check below. It now runs only when the planner returned nothing.

⛔ **Suggestions are not clinically reviewed, and they are what everyone
sees.** They are written by a software engineer; no clinician has read
`PLAN_SYSTEM_PROMPT`, and since 2026-09-12 it is the whole of the guard rather
than one layer of two. It belongs in the same review as `followup.py` and
`dose_schedule.py` and is now clearly the most urgent of the three.

⛔ **The safety checks are asymmetric, and origination is on the weaker side.**
The quoting and digit checks below cannot apply to a plan nobody wrote, so an
originated row is now guarded by the prompt alone, where a structured row is
guarded by the prompt *and* the requirement that it quote the person. Almost
every row a person sees is an originated one. **Reinstating a narrow, reviewed
veto list is the cheapest safety work available in this feature** — it is
deliberately not guessed at here, and it is the first thing to ask the
clinical reviewer about.

### The plan carries a daily schedule

Each proposed activity comes back with `days` (which days of the week) and
`time_of_day` (a local wall-clock `"HH:MM"`), added 2026-09-12. That is the
half the person came for: a plan with no schedule is a list.

- ⛔ **A time is a local wall clock, never a UTC instant** — the same rule as
  `medication_reminders`. Eight in the morning means eight in the morning
  wherever the person is; storing an instant would move their plan when they
  travelled.
- **`cadence` and `times_per_week` are derived from `days`**, in
  `_validate_plan` and again on the editor when the person re-ticks days. The
  model is not asked for them. A plan therefore cannot say "three times a
  week" beside four ticked days, and the old failure where a weekly cadence
  arrived without its count and discarded the whole plan is gone by
  construction.
- **A time is refused, never guessed.** `8am`, `0800` and `8:00` are rejected
  by both the core module and the schema, exactly as `dose_schedule.py`
  rejects them: "8" could be either end of the day.
- **A row with no usable day list or time discards the whole plan.** A
  silently half-scheduled plan is harder to notice than an absent one.
- **A `structure` row carries no schedule at all**, deliberately. That path
  may only rearrange words the person wrote, and a clock time is digits
  nobody wrote — the same rule that stops it inventing a duration. The person
  sets their own days and time on the editor.
- **An activity with no days is not treated as daily.** It is unscheduled,
  reads "Whenever you choose", and is never marked "Due today" — nobody chose
  those days. It stays tickable, because a tick is a note the person makes
  for themselves.
- ⛔ The goals screen marks due rows **"Due today", not "Today"** — the tab
  bar already has a tab called Today, and one word meaning two things on one
  screen is worse for a screen reader than a longer label.
- ⛔ Still **not an adherence record**. The marker says which day a row falls
  on; it never counts, scores, or says how many are left. No "2 of 3 today".
  Asserted by a test.

**Deploying this needs the column script.** `days` and `time_of_day` went onto
the existing `goal_activities` table, so run
`scripts/add_goal_schedule_columns.py` once against any database created
before this change or `/goals` returns 500s. It is idempotent and the Render
start command runs it. Neither column is backfilled with a guess: a goal saved
before this does not acquire an 08:00.

### The structuring rule is checked, not trusted

Every activity read out of the person's own words must carry a `source_phrase`
that occurs in the submitted text, and `core/goal_structuring.py` discards the
*whole draft* if any does not. A model that wants to add stretching to a
walking goal has to quote "stretch" out of text that never contained it.

Four further checks follow the same principle, most importantly that **no digit
may appear in an activity unless the person wrote it** — an invented number is
the likely shape of an invented duration, distance or dose. It is also why a
`structure` row carries no clock time: a time is digits nobody wrote.

⛔ **This applies to the fallback path only.** Suggested rows are exempt from
the quoting and digit rules by construction, since nothing was written to
quote. The veto list used to guard them instead; it was removed on 2026-09-12,
so nothing deterministic guards them now. `_validate_plan` checks shape — a
title, a day list, an `"HH:MM"` — and does not look at content at all.

Rules for anyone extending this:

- **Never add a progression engine.** Nothing may increase a target because a
  week went well; that is authoring, one week at a time, and it is exactly
  what the substring check exists to prevent.
- **Never add a second model to review the first.** A gate whose failure mode
  is a silent pass is not a safety layer. The checks here are deterministic
  for the same reason the triage rule layer is a phrase list a person can read.
- **A refusal returns a code, never a sentence.** The four strings a person
  reads live in `_REFUSAL_NOTICES` in `api/goals.py`, because user-facing text
  in a health app is reviewed text. `core/goal_structuring.py` must never
  return prose.
- **Failure is never a plan.** No endpoint, an outage, or a failed check all
  yield an empty editor plus the server's own sentence. There is no generated
  fallback, for the same reason a model outage in triage is never SELF_CARE.
  Those three are one sentence to the person and three different repairs to an
  operator, so `_discard()` logs **which check** caught a draft — the check's
  name only, never the value that failed it, which is the person's own health
  text. A `source_phrase is not in the submitted text` line means the model
  paraphrased instead of quoting: the check working as designed, and worth
  looking at the prompt only if it fires for everybody.
- **Emergency screening runs first**, in `api/goals.py`, before the model is
  called. A goal box takes "stop feeling dizzy on the stairs" as readily as
  intake does, and guidance is returned alongside a refusal or an outage
  rather than instead of it.
- ⛔ **This is not an adherence record.** A tick is a note the person made for
  themselves. An unticked activity means nothing was ticked — not that
  anything was missed, skipped or failed. **No streaks, no percentages, no "3
  of 4 done" tiles**, the same mistake CLAUDE.md warns about for the home
  screen's panels. `mobile/__tests__/GoalScreens.test.tsx` asserts the words
  never appear.
- A completion is a **local calendar day** sent by the client, never a UTC
  instant — the same rule as a reminder being a wall-clock "HH:MM".
- Deleting a goal deletes its activities and every tick, in the endpoint as
  well as by foreign key. SQLite does not enforce the cascade, so the test
  asserts against the table.

**Not built, deliberately:** reminders for a goal, and any weekly review.
Neither is hard — a reminder would reuse the local-only `notificationService`
— but both add surface to an instrument no clinician has read.

### Approval, and what it does not cover

The repository owner asked for this feature in conversation on 2026-09-07,
having been shown that the originally proposed design (a model authoring
weekly plans, with a second model checking them for safety) could not be
built here. That is approval to **build it on a branch**.

They asked again on **2026-09-12**, in conversation, for the blocking to be
removed and for the section to produce a plan and a daily schedule for any
health goal typed in. That is the approval this change rests on, and it was
given after being told plainly that removing `_FORBIDDEN` leaves the prompt as
the only guard. Same basis as the other entries this file records: a person
answering in their own words, outside the agent pipeline.

⛔ Neither is clinical sign-off, and the 2026-09-12 one makes that review more
urgent rather than less. `SYSTEM_PROMPT`, `PLAN_SYSTEM_PROMPT` and the cadence
copy in `core/goal_structuring.py` are a software engineer's construction and
belong in the same review as `followup.py` and `dose_schedule.py`. It is
**not** approval to merge to `main` or to deploy — this file fences those
separately and they need their own answer.

The goals screens deliberately do **not** use `DisclaimerBanner`. Which
screens show it is fenced by this file, and adding it to a new screen is a
reviewer's call, not a layout one. They carry a plain statement about the
software instead.

⛔ **That statement was rewritten on 2026-09-12 and the old one must not come
back.** It used to read "MedHelp tracks what you decide to do, does not decide
what your goals should be" — which stopped being true the moment the app began
proposing plans. `GoalCreateScreen` now says the suggestions were written by
MedHelp rather than by a doctor or nurse, that nobody medically qualified has
checked them, and to speak to a professional before acting on a goal about a
medical condition, a medicine, or a big change to eating or exercise. With the
refusal gone, that footnote is the only thing on the screen telling a person
what they are looking at. A test asserts it.

### Goals may use a different model endpoint from triage

`GOALS_LLM_BASE_URL` / `GOALS_LLM_MODEL` / `GOALS_LLM_API_KEY`, each falling
back to its `LLM_*` counterpart when empty.

**Why this is not gratuitous config.** One set of settings used to serve every
model caller, so pointing them at a hosted provider to get goal suggestions
also started sending *symptom descriptions* there — the most sensitive free
text in the app, belonging to the feature with the standing release blocker.
A data-handling decision must not happen as a side effect of switching on a
different feature.

- **Unset, the overrides change nothing.** A deployment that never sets them
  behaves exactly as it did before the split. Asserted by a test, because that
  property is the whole reason this was safe to add.
- `llm.Endpoint` carries a `label`, so the transmission warning names *which*
  data is leaving — "Health goal descriptions" or "Symptom descriptions".
- The warning fires **once per host**, not once per process. Two endpoints
  mean a warning about one is not a warning about the other.
- ⛔ **`tests/conftest.py` must blank these too.** The autouse `_no_live_model`
  guard exists because the suite once made real calls from a developer's
  `.env`; a second set of settings is a second hole in it, and
  `tests/test_llm_endpoints.py` asserts the guard covers them.

#### A Groq key on its own is enough, wherever it is set

Setting the three `GOALS_LLM_*` variables is the general form — any provider,
stated in full. A Groq key is the one-setting form of the same thing:
`llm.groq_endpoint_or_none()` pairs it with `GROQ_BASE_URL` and
`GROQ_DEFAULT_MODEL`, both constants of that vendor, so goal drafting works
from a pasted key.

This exists because of a reported failure with a silent symptom. The
`GOALS_LLM_*` fallback is all-or-nothing on purpose — see above — so a key set
without a base URL beside it was ignored *entirely*, and goals fell through to
`LLM_*`. Where that names an Ollama that is not running — a dev machine with
nothing started, or a hosted instance where nothing listens on localhost — the
result is an outage, and an outage here is the sentence "MedHelp has no
suggestions right now" with a working key set three inches away.

`llm.groq_key_source()` therefore reads a Groq key from three places, in
order: `GROQ_API_KEY`; `GOALS_LLM_API_KEY` with no `GOALS_LLM_BASE_URL` beside
it; `LLM_API_KEY` with no `LLM_BASE_URL` beside it. The last two are read
**only** when the key carries Groq's own `gsk_` prefix, so the vendor is read
off the key rather than assumed, and an OpenRouter or Google key parked in the
same slot is never posted to Groq. A key that is already beside a base URL is
doing a job and is never reassigned.

- **Precedence: an explicit `GOALS_LLM_BASE_URL` wins, then `GROQ_API_KEY`,
  then `LLM_*`.** Naming a provider in full is the more specific instruction,
  so a leftover key cannot redirect goals away from an endpoint someone chose
  deliberately — including a local one, the only choice that transmits nothing.
- **`GOALS_LLM_MODEL` still names the model** when it is set, so a different
  Groq model is one setting rather than a second code path.
- ⛔ **The key is read in `goals_endpoint()` and nowhere else, and must stay
  that way.** The reason this shortcut is safe is that it cannot move symptom
  descriptions: those go wherever `LLM_*` says, which is nowhere by default.
  A key that switched on both features at once would make the most sensitive
  free text in the app a side effect of switching on goal suggestions, which
  is precisely what the endpoint split exists to prevent. Tested.
- The shortcut is through the configuration, never through the disclosure:
  the endpoint is not local, so the transmission warning names Groq and the
  goal text exactly as any other hosted endpoint does. Also tested.
- ⛔ `tests/conftest.py` blanks this too, for the same reason it blanks the
  others — it is a third way to reach a live endpoint from a developer's
  `.env`.

**A wrong value fails as loudly as a missing one.** Both of these reach the
person as the same sentence — "MedHelp has no suggestions right now" — and used
to reach an operator as an indistinguishable `HTTP 404`:

- `llm.completions_url()` corrects the two base URLs people actually mistype:
  one that already ends in `/chat/completions` (copied from a provider's curl
  example, and otherwise doubled), and `https://api.groq.com` with no path,
  which is the vendor's name for itself rather than its OpenAI-compatible base.
  ⛔ Nothing else is guessed — an unknown host with an unexpected path is sent
  exactly as configured, because rewriting it would hide the real mistake.
- `llm.chat` names the provider's own error **code** when it is one of the
  handful in `_KNOWN_ERROR_CODES`, so a retired model name and a revoked key
  stop looking alike. ⛔ It is an allowlist, not "log whatever we were given":
  the rule that nothing from a response body is read unless it is known to be
  safe still holds, because a provider error message can quote the request —
  which is the person's own health text. A test asserts an unfamiliar body
  contributes nothing but its status code.

**A misconfiguration here is no longer invisible.** `report_goals_endpoint()`
in `app/main.py` logs at boot which model goals resolved to and which setting
the key came from — never the key itself — or says plainly that there is none.
`GET /health` reports `health_goals_model_configured`, a boolean beside
`symptom_intake_configured` and held to the same rule: it says a credential
source exists and never which vendor or which key. Both exist because drafting
answers with an empty editor for a missing key, an unreachable endpoint and a
refusal alike, so "is a model even configured?" could not be answered from a
deployment nobody can attach a debugger to.

### PHI status

`health_goals`, `goal_activities` and `goal_completions` say that a named
person intends to do a named thing and did or did not tick it on a named day.
**Not encrypted at rest** — the same open finding as `medications`,
`intake_assessments` and `appointments.reason_for_visit`.

Goal text is health free text about an identified user, so a non-local
`LLM_BASE_URL` transmits it to a third party this project has no BAA with.
`llm.endpoint_is_local()` makes the distinction visible; it does not make it
safe. With no endpoint configured the feature still works — the person types
their own activities and nothing leaves the machine.

## Application security posture (implemented)

What actually protects the data, and what each control does not cover. Read
this before touching auth, CORS, or how the server is served.

### The signing key is the whole of authentication

Every per-user filter in `app/api` — medications, reminders, appointments,
intake — trusts one thing: a bearer token signed with `JWT_SECRET_KEY`. A
weak or public key defeats all of them simultaneously, because a forged token
is indistinguishable from a real one.

`.env.example` used to publish a working default
(`dev-only-placeholder-secret-change-me`), and `config.py` used it as its
field default. That is not a secret — it is in every clone of this repository —
so anyone who had read the repo could mint a token for any user id and read
that person's health data.

- There is **no usable default** any more. `Settings` rejects a missing,
  short (<32 char) or placeholder key.
- Outside a development `ENVIRONMENT` this is a **refusal to boot**, not a
  warning. A health API that comes up with a published signing key is worse
  than one that does not come up, because nothing about it looks wrong from
  the outside.
- Inside development the key is **replaced with a random one per process**.
  Sessions stop surviving a restart, which is the correct trade: no running
  copy of this app anywhere accepts a token signed with a value in source
  control.

### Tokens

- **The algorithm is fixed at HS256 in code and is not configurable.** It used
  to be read from `JWT_ALGORITHM` in the environment. An algorithm anything
  else can influence is how algorithm-confusion and `alg: none` forgery start.
- `iss`, `aud`, `typ`, `exp` and `iat` are **verified**, not merely present, so
  a token minted for something else does not authenticate here. `jti` is
  recorded but not yet read — it is there so a revocation list can be added
  without invalidating every issued token.
- ⛔ **There is still no revocation.** `logout()` forgets the token on the
  device; a stolen one stays valid at the server until it expires (60 minutes
  by default). Session invalidation remains a Known Gap.
- **The library is PyJWT, and it was python-jose.** python-jose drags in
  `ecdsa`, which carries an unfixed Minerva timing advisory with no patched
  release to move to — the only way off it was to stop depending on it. It was
  never reachable here (HS256 only; no EC key is ever loaded), but the same
  library had already cost this file two CVE notes in a year, and "unreachable"
  is an argument you have to re-make at every audit. Same algorithm, same
  verified claims.
  - ⛔ **The two libraries spell claim requirements differently, and PyJWT
    ignores option keys it does not recognise.** jose's `require_exp` /
    `require_iat` / `require_sub` are one `"require": [...]` list in PyJWT.
    Carried over verbatim they would have read like they demanded those claims
    while demanding nothing — and a token with no `exp` and no expiry check is
    a token that never expires. It fails silently, so
    `test_a_token_missing_a_required_claim_is_rejected` pins each claim.
  - `strict_aud` is now on. Without it PyJWT accepts an `aud` **list** that
    merely contains ours, so a token minted for another service that also
    listed this one would authenticate here. Every token minted here has a
    string `aud`.

### The session survives a reload, and dies with the tab

The token used to live in a module variable and nowhere else, so a browser
refresh — the ordinary way this app is used, served to a phone over the LAN —
signed the user out mid-task. It is now also written to storage, and read back
once at startup by `restoreSession()` in `authService.ts`.

Where it is written is platform-split, the same shape as the scanner, the
notification service and location:

| | Store | Survives a reload | Survives the app or tab closing |
|---|---|---|---|
| `tokenStorage.ts` (iOS/Android) | Keychain / Keystore, `WHEN_UNLOCKED_THIS_DEVICE_ONLY` | yes | yes |
| `tokenStorage.web.ts` (browser) | `sessionStorage` | yes | **no** |

Rules for anyone extending this:

- ⛔ **Do not move the browser's copy to `localStorage`.** This is a bearer
  credential for one person's medications, appointments and symptom
  assessments, in an app with no revocation. `sessionStorage` ends with the
  tab, which is what should happen when someone walks away from a shared or
  borrowed computer, and it costs the user nothing: the token is only valid
  for an hour, so persisting it for longer mostly stores something the server
  will refuse anyway. Neither store is protected from script running on the
  page — the defence against that is the CSP, not the choice of store.
- On native the keystore entry is deliberately **this device only**, so a
  credential for health data is kept out of iCloud Keychain sync and encrypted
  device backups.
- **The navigator decides which screen to open on before it mounts.**
  `initialRouteName` is read once, and reading the store is asynchronous, so
  `RootNavigator` renders a spinner until `restoreSession()` answers.
  Rendering the sign-in screen first and redirecting afterwards would show a
  signed-in user a login form they never had to fill in.
- **Only the server decides whether a token is valid.** The client reads
  `exp` for one reason: not to restore a session it can already see is dead,
  which would land someone on the home screen and fail on their first tap. A
  token it cannot parse is restored and allowed to fail as a 401 — being
  unable to read a token is not evidence that it is bad.
- **A 401 clears the store**, in all three request paths (`apiClient`,
  `medicationService`, `intakeService`). A token the server has refused is
  worthless, and leaving it behind would restore a dead session on the next
  launch.
- **Sign out exists because the session now persists.** `HomeScreen` resets
  the navigation stack to `Login` rather than navigating, so the back gesture
  cannot walk into signed-in screens. It ends the session on the device only —
  there is no revocation, so the token stays valid at the server until it
  expires.
- `mobile/e2e/web-session-persistence.mjs` (`npm run e2e:web:session`) drives
  real Chrome through sign-in, two reloads, sign-out and an expired token. A
  reload in jsdom is a fresh module registry either way, so a fake store and a
  real one look identical there; this is the only place the behaviour is
  actually observed. It needs no backend — the sign-in call is stubbed.

### Sign-in

- Both `/auth/login` and `/auth/signup` spend from a per-address budget
  (`app/core/rate_limit.py`). Before this, an 8-character password could be
  guessed at network speed with only bcrypt's cost factor in the way.
- **Read that module's limits.** It is per process, in memory, keyed on the
  socket address, and deliberately does **not** trust `X-Forwarded-For` — a
  client can put anything in that header, so honouring it without a proxy you
  control would let an attacker reset their own counter every request. It is
  the floor under a reverse proxy or WAF, not a replacement for one.
- Login costs the **same work whether or not the account exists**
  (`verify_password_for_missing_user`). The identical error message was
  already there; without this the response *time* answered the question the
  message was written to avoid answering.
- ⛔ **Signup still discloses that an address is registered.** That is user
  enumeration, kept on purpose: without an email-verification flow, hiding it
  means telling someone their account was created when it was not. Closing it
  properly means adding verification, which is a feature decision.

### Symptom intake is deliberately NOT rate limited

A 429 on `POST /intake/assess` is a refusal to screen someone who may be
describing chest pain, and emergency guidance is the one thing this app must
never withhold. The cost exposure that argues for a limit is real, so the
limit belongs at a reverse proxy tuned by someone who has read the safety
architecture — not bolted onto the endpoint.

### CORS

`allow_origins=["*"]` is gone. Origins are an explicit allowlist
(`CORS_ALLOW_ORIGINS`), `allow_credentials` is off because the app
authenticates with a bearer token rather than a cookie, and `*` is refused
outright outside a development environment. In development only, any
loopback/private/LAN/mesh origin is also accepted, which is what keeps
`http://192.168.1.5:8081` working without editing `.env` on every network
change. That regex mirrors the client-side rule in
`mobile/src/services/baseUrl.ts` — **keep the two in step.**

### Response headers

Every response carries `nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: no-referrer`, a `default-src 'none'` CSP (skipped for the
docs pages, which are real HTML), and `Cache-Control: no-store`. The last one
is not boilerplate: the responses of this API are one person's medications,
appointments and symptom assessments, and a browser disk cache is a place
health data leaks from later. HSTS is sent only when the request already
arrived over TLS — pinning a host to https before a certificate exists locks
you out of your own dev server.

### The server is served over http by default, and that is a real exposure

Run over `http://192.168.x.x` — the way this app is used without an Apple
developer account — email, password and every symptom description cross the
LAN in the clear. `backend/scripts/generate_dev_cert.py` generates a
self-signed certificate with the machine's LAN addresses as SANs, and README
has the uvicorn and `serve` invocations for both halves.

**State the property precisely.** A self-signed certificate **encrypts but
does not authenticate**: traffic on the wire becomes unreadable, and nothing
proves the server is the one you meant, so it does not stop someone on the
network impersonating it. Real users need a CA-issued certificate against a
real hostname. The private key lives in `backend/certs/`, which is gitignored
along with `*.pem` and `*.key`.

### API docs

`/docs`, `/redoc` and `/openapi.json` are served only in a development
environment. An unauthenticated machine-readable map of every route and field
is free reconnaissance, and this API has no public consumers.

## Public deployment (implemented)

The app is deployable to a public URL from one Render blueprint at
`render.yaml`: a static site for the web build, the FastAPI backend, and
Postgres. Procedure and failure modes: `docs/deployment.md`.

### ⛔ The approval this required, and what it does not extend to

This file fences "merging to `main`, releasing, or deploying anywhere" behind
explicit human approval obtained outside the agent pipeline. **That approval
was given directly by the repository owner in conversation on 2026-09-02**,
after being told that a public link means anyone who finds it can create an
account and type real symptoms into an instrument no clinician has reviewed.
They also chose open sign-up over an invite code, having been offered both.

The approval covers **deploying this demo**. It is not an approval of anything
the release blockers above cover, and no agent may read it as one:

- It does not make the app safe to put in front of real patients. Every
  blocker in "⛔ BLOCKING: symptom intake requires clinical and legal sign-off"
  is untouched.
- It does not authorise switching on `MEDLINEPLUS_TOPICS_ENABLED`, setting
  `TRIAGE_LOG_CLASSIFICATIONS`, flipping `delivery_available()`, or any other
  gated thing that happens to be reachable now that a deployment exists.
- It does not authorise a second deployment, a custom domain, or merging to
  `main`. Ask again.

### What publishing changed, and what it did not

Exactly one open finding closed, and it closed because of the host rather than
because of any code here: traffic is now encrypted **and authenticated** in
transit by a CA-issued certificate. The self-signed certificate the LAN setup
uses encrypts without authenticating, so it never stopped someone on the
network impersonating the server. As a side effect the browser's Geolocation
API works for the first time, because a real https origin is a secure context
and `http://192.168.x.x` is not.

Nothing else moved. Still open, and unchanged by deploying: encryption at
rest, token revocation, an audit log of reads, the BAA question with every
vendor, and clinician review of the triage instrument, the emergency phrase
lists, the follow-up questions and the dose-schedule phrase lists.

Two things get *worse* in a way worth stating plainly, because they were
previously bounded by the LAN:

- **The rate limiter is now the only thing between a public address and the
  sign-in endpoint.** It is per-process and in-memory (open finding 6), which
  on one free instance means it is exactly what it says it is, and no more.
- **The dev-only findings are no longer dev-only in practice.** Finding 3 — a
  real email address in a development database — is about a database on this
  machine, but the same mistake made on a public deployment is a live one.
  Synthetic data only, there as here.

### How the pieces find each other

- **Two services, not one.** The API's response headers are deliberately
  hostile to HTML: `default-src 'none'` would stop the bundle loading and
  `geolocation=()` would switch off the "Use my location" button. Serving the
  web build from FastAPI would mean relaxing a reviewed security control to
  save a configuration line. See the ⛔ note in `app/main.py`, which
  anticipated exactly this.
- **The app is told where the API is at build time.** `EXPO_PUBLIC_*` is
  inlined by babel, so `render.yaml` composes `EXPO_PUBLIC_API_BASE_URL` from
  the API service's real hostname via `fromService` and passes it to
  `expo export`. Without it, `baseUrl.ts` would look for the API on port 8000
  of the host that served the page — right on a LAN, wrong here. **A rename of
  the API service therefore needs the web service rebuilt, not restarted.**
- **CORS is a literal in the blueprint**, because the web service already
  references the API and Render will not resolve a cycle. If Render suffixes
  the site's URL, `CORS_ALLOW_ORIGINS` has to be corrected by hand — the
  symptom is an app that loads and then fails every request. `docs/deployment.md`
  says so where someone will actually hit it.
- `ENVIRONMENT=production`, so `config.py` applies its production rules: a weak
  signing key is a refusal to boot, a `*` origin is refused, `/docs` is not
  served, and `sslmode=require` is appended to the database URL.
- **Tables are created by the start command**, running
  `scripts/create_missing_tables.py` before uvicorn. Alembic is still not wired
  up (see "Known Gaps"), and `create_all` creates what is missing without
  altering what exists. That is a demo's answer, not a release process: a
  column added to an existing model still needs a hand-written script.

## Visual direction: paper ground, prominence ladder (implemented)

The 2026 visual pass. Two halves, and they are separable — the surface came
from one explored direction and the structure from another.

**The surface.** The ground moved from a cool blue-grey to a warm paper
(`background` `#F6F2EA`), the type to **Literata** over **Public Sans**, and
depth from drop shadows to hairline rules — `elevation.sm`, which every
resting card used, is now flat. The reasoning is specific to this app rather
than fashionable: every claim MedHelp makes is hedged, so a document that
reads as *written down and attributable* fits it better than a card floating
on a shadow, which reads as a product asserting something.

**The structure.** Every block sits at one of four prominence levels and a
screen gets **exactly one filled action** (`PROMINENCE_LEVELS` in `theme.ts`).
The home screen's four destination cards used to be drawn identically, so
nothing was primary and a reader had to read all four before choosing; it is
now one filled `NavCard variant="primary"` above a `NavGroup` of three rows.

### ⛔ The reviewed safety colours did not move

`emergencyText`, `emergencySurface`, `emergencyBorder`, the `notice*`,
`error*` and `success*` families are byte-for-byte what they were. Only the
neutrals, the type and the depth changed. **Do not restyle a safety family to
match a future direction** — a direction is a preference and those are a
decision someone signed off on.

Also untouched: `DisclaimerBanner.tsx`, the intake disclaimer's copy, palette
and position above the input, `INTAKE_DISCLAIMER`/`ESCALATION_GUIDANCE`, and
every triage and emergency module. Which screens show a disclaimer is
unchanged.

### ⛔ The emergency palette is exempt from the one-filled-action rule

`EmergencyCallBar`'s "Call 911" and the emergency card's contact call stay
filled wherever they appear, however many other filled controls share the
screen. The ladder exists to stop the app shouting; the one thing it may
always shout about is how to get help. On the emergency card that is why
"Edit these details" is `variant="outline"` — it is the third button on a
screen whose other two must not be made ordinary.

### ⛔ Set `fontFamily`, never `fontWeight` or `fontStyle`

Each weight is a separate font file. Asking Android for a bold weight of a
face that is already bold gets a synthetically smeared double-bold, and
`fontStyle: "italic"` shears an upright face rather than using the italic. The
type tokens name families for this reason, and `fonts.serifItalic` exists so
the emergency card's "Not provided" is a real italic.

### ⛔ Import font faces by their per-weight subpath

`@expo-google-fonts/*` package roots `require()` every weight they ship — 16
faces each, italics included — so importing four names from the root bundles
all 32. The first web export after this change carried ~2 MB of fonts nobody
asks for. `App.tsx` imports
`@expo-google-fonts/literata/600SemiBold` and friends instead; the export now
carries exactly the eight faces `theme.ts` names.

`expo-font` is pinned to `~12.0.10`. npm will happily resolve it to 57.x,
which does not work on Expo 51.

### Nothing renders until the faces load, but a font failure never blocks

`App.tsx` gates on `useFonts`. Every type token names a family, so a screen
painted before the faces land is painted at the wrong metrics and reflows
under the reader. A *failure* is different from a wait: if the faces cannot
load at all the app opens anyway on the system font, because blocking the
emergency card behind a font download would be indefensible.

### The serif is the app quoting; the sans is the app speaking

Literata is used only for text a person wrote or a source published — what
the user typed into the symptom field (`typography.bodyQuoted`, applied to
any `multiline` `TextField`), the values on their emergency card, a
destination's name. Single-line fields stay in the sans: an email or a ZIP is
data, not prose.

### Two things a reviewer should be told

- **`typography.overline` stayed at 13px.** The direction drew section labels
  at 11px; that was not adopted, because the 13px floor is an accessibility
  decision — small uppercase type is the first thing to fail for anyone with
  low vision — and it outranks a mockup.
- **One line of new user-facing copy** was added under the symptom field:
  "Your own words. Nothing here is rewritten before it is assessed." It
  describes existing behaviour (keyword extraction only chooses which article
  to look up), and it is asserted by a test so that anything which later
  paraphrases a description on the way in has to remove the claim too. It is
  not clinical content, but it is a statement about the instrument and
  belongs in the same reviewer's read as the intake screen.

## The web layout fills the window it is given (implemented)

Every screen used to be one column capped at 620pt, on a phone and on a
1440pt browser window alike, so the browser build was a narrow strip of
content with empty background either side.

`useBreakpoint()` (`mobile/src/hooks/useBreakpoint.ts`) reports which of three
shapes the layout should take, from the **window width** — not from
`Platform.OS`, which would be the wrong question twice: a browser window
dragged narrow should get the phone layout, and a tablet should get the wide
one. `BREAKPOINT` lives in `theme.ts`.

- Below `medium` (760): unchanged. Every screen is the single stacked column
  it has always been, and every existing test renders at this width.
- At `medium`: the home screen's destination cards sit two across.
- At `expanded` (1040): the home screen splits into columns, and sign-in and
  sign-up become two panels — what the app is on the left, the form on the
  right.

`CONTENT_WIDTH.page` and `Screen`'s `page` prop exist for the second case only.
⛔ Do not pass `page` to make a lonely-looking form or list wider: `form` and
`wide` are line-length limits, and a 1140pt line of body text is harder to read
than a 660pt one. Only a screen whose children actually split into columns
should use it.

### ⛔ What may fill the space

The panels added to the home screen (`InfoPanel`) are **statements about the
software**: what the app does, what it deliberately does not do, and where data
goes. Each restates something the repository already says rather than adding a
new claim — the "will not do" list is this file's App Scope, and the data lines
are the on-device-scanning and provider-search rules.

Two things must never fill this space, and the note at the top of `InfoPanel`
says so where someone would be editing:

- **Clinical content.** An agent may not author symptom, condition or dosage
  text at all, and the sourced text the app does show is rendered verbatim
  with attribution — which is not what a decorative panel does.
- **Numbers about the user's health.** MedHelp does not know whether a dose was
  taken. A "3 of 4 taken today" tile would invent a clinical fact about the
  user, and is the same mistake the home screen's hero comment has always
  warned against.

The intake screens were deliberately left alone. Their disclaimer placement is
part of what this file fences ("which screens show them"), and moving a
required disclaimer into a side column changes its prominence, which is a
reviewer's call and not a layout one.

## The home screen is four things you can press (implemented)

The home screen used to be a dashboard: four destination cards, three
explanatory panels, a hero and a sign-out button, all visible at once. It is
now a small set of primary actions, with everything else one tap deeper on
`MoreScreen`.

| Home | More |
|---|---|
| Not feeling well? → `SymptomIntake` | My medications → `MedicationList` |
| Add medication → `MedicationEdit` | Medication reminders → `MedicationReminders` |
| Upcoming appointments → `AppointmentList` | All appointments → `AppointmentList` |
| More → `MoreScreen` | Find a provider → `ProviderSearch` |
| Emergency card → `EmergencyCard` | Emergency card, and editing it |
| | Sign out, and the two scope panels |

### ⛔ This is a move, not a removal

Every destination that came off the home screen is on `MoreScreen`, named in
full, one tap away. **No route was renamed, removed, or re-parameterised**, so
nothing that navigated anywhere before the reshuffle navigates anywhere
different now — the intake-to-booking flow in particular is untouched.

`__tests__/navigationReachability.test.ts` holds this mechanically. It reads
the navigator's registrations and every `navigate` / `replace` / `reset`
target across `src`, and fails when a registered route has no way in, or when
something navigates to a route that is not registered. The failure mode of a
reshuffle is not a crash — it is a screen that is still registered, still
tested, still perfect, and that nothing reaches any more, so everything passes
and nobody notices.

`ROOTS` in that file names the routes entered without anyone navigating to
them (`Login` and `Home`, which is what `initialRouteName` chooses between).
Adding to that list is how a route is declared intentionally unreachable by
`navigate`; it should stay short.

Nothing is nested deeper than More. A flat list of named destinations is
findable; a menu of menus is not.

### ⛔ A screen that hides the navigator header owns its own way back

Reachability has two directions, and the first version of that test only
checked one. It asked whether every route could be navigated *to*; it never
asked whether you could get *out*.

`EmergencyCard` sets `headerShown: false`, so its red header is not doubled by
the navigator's — which also removes the back button. **A browser has no
back gesture to fall back on, so the screen had no way out at all**: every
control on it went deeper. Nothing failed, no test caught it, and the whole
suite was green. It was found by opening the screen in a browser.

The screen now draws its own "‹ Back" inside the red header, above the title
so it is reachable without scrolling however long the card grows.
`navigationReachability.test.ts` reads the navigator for screens that set
`headerShown: false` and asserts each one calls `goBack` itself, and
`EmergencyCardScreen.test.tsx` presses it.

**Anything that turns the header off inherits this obligation.** The three
other headerless screens are exempt for a real reason rather than by
oversight: `Login` and `Home` are what `initialRouteName` chooses between, so
there is nothing behind either of them, and `Login` and `Signup` each carry an
explicit link to the other in the body of the screen. `EmergencyCard` had
neither property, which is what made it a dead end.

### ⛔ "Add medication" opens the form, not the list

The card names an action, so it performs it: `MedicationEdit` with no
parameters, which is the add form. Routing it through the list would make it
two taps for the thing the card says. The list is on More.

### ⛔ The inline appointment is not "the next one"

`IntakeResultScreen`'s URGENT hand-off and the appointment list both rest on
the fact that **MedHelp does not know when an appointment is**.
`preferred_time` is free text by design ("Thursday morning", "as soon as
possible"), and there is no scheduled datetime on the record — the appointment
rules fence adding one ("Do not add a slot picker, a 'Book now' button, or a
time, until a real scheduling integration exists behind it") precisely because
a time this app invents is a time someone turns up for.

So the home screen shows the most recently *recorded* open appointment, under
the label **MOST RECENTLY RECORDED**, with the provider name and the preferred
time rendered verbatim. It does not say "Next", and a test asserts it does not.
This is the one part of the requested design that could not be built as
described, and the reason is a fence rather than an oversight.

It also repeats "MedHelp has not contacted anyone" for a REQUESTED
appointment, which is the same line the list carries on every card and for the
same reason: a list is skimmed, and whether the clinic knows is the one thing
a user must not misread.

The lookup **fails silently**. The home screen's job is to be four things you
can press; an error notice there would put a red box on the first screen of
the app over a line of supporting detail, and `AppointmentListScreen` reports
its own failures properly when opened.

### What filled the space, and what moved

The panels are unchanged in content — see "⛔ What may fill the space" above,
which still governs them. What changed is where they are:

- **"What MedHelp will not do" stayed**, beside the actions on a wide window
  and stacked under them on a phone. It restates App Scope, and that is the
  thing worth saying on the way in.
- **"How MedHelp works" and "Where your information goes" moved to More.**
  They are onboarding rather than everyday content.
- ⛔ The panel that stayed is kept at **every** width. Dropping it below
  `BREAKPOINT.expanded` would have been a tidier consolidation and would have
  quietly made the scope statement a desktop-only feature —
  `responsiveLayout.test.tsx` already asserted against exactly that, on the
  grounds that a narrower screen is not a reason to stop saying what the app
  will not do. That assertion was kept rather than rewritten.

The short scope note at the foot of the screen is unchanged and still present
at every width. The reviewed `DisclaimerBanner` is not on this screen and was
not moved onto or off it — which screens show it is fenced.

### Sign out moved to More, and does not clear the emergency card

`MoreScreen` resets the navigation stack to `Login` rather than navigating, so
the back gesture cannot walk into signed-in screens — unchanged behaviour,
new location.

⛔ It deliberately does **not** clear the emergency card, which lives in a
separate store and is meant to outlive a session. The screen says so, because
on a shared computer that is a surprise worth naming, and points at "Erase
this card".

## Open data-handling findings

### Closed (fixed, with tests)

1. ~~**Passwords are echoed in 422 responses.**~~ The
   `RequestValidationError` handler in `app/main.py` strips `input` from every
   validation error, so a rejected password or symptom string is not returned.
2. ~~**`GET /medications/reminders` is unscoped.**~~ Reminders were rewritten
   in `app/api/reminders.py` scoped to the caller from the outset, with a test
   that a second user cannot see the first user's rows.
3. ~~**`decode_access_token` is never called.**~~ `get_current_user` in
   `app/core/dependencies.py` guards every route that touches user data, and a
   validly-signed token for a deleted account does not authenticate.
4. ~~**CORS is `allow_origins=["*"]`.**~~ Explicit allowlist, credentials off,
   wildcard refused outside development. See "CORS" above.
5. ~~**A 500 traceback writes the symptom description to the log.**~~ Fixed at
   the source rather than per-route: `app/db/session.py` creates the engine
   with `hide_parameters=True`, so SQLAlchemy no longer puts bound values into
   its own exception text. This is the load-bearing fix — Starlette re-raises
   server errors so uvicorn can log them, so an exception handler alone would
   not have stopped it. `app/main.py` also returns one fixed sentence for any
   unhandled failure, so nothing crosses the wire either.
6. ~~**The signing key is the published placeholder.**~~ See "The signing key
   is the whole of authentication" above.
7. ~~**The deployed API ran on dependencies with 18 known advisories.**~~
   `pip-audit` now reports none. The reachable ones were in code that runs
   *before* a route is chosen, so they were exposed to anyone who could reach
   the API: nine against `starlette` 0.38.6 (Host-header and request-path
   injection into `request.url` reconstruction, unbounded multipart buffering,
   `form()` limits being ignored) and seven against `python-multipart` 0.0.9
   (parsing denial of service, field-separator confusion). Closing the
   starlette ones needed `fastapi` to move first — 0.115.0 held starlette below
   0.39, and every fix lands in 1.x — so the pinned pair is now
   `fastapi==0.141.1` with `starlette>=1.3.1,<1.7`, verified against the whole
   backend suite. `pytest` moved to 9.0.3 for a predictable-tmpdir advisory
   that only ever affected developer machines. The last one, `ecdsa`, had no
   fix to move to and was removed with the library that pulled it in — see
   "Tokens".

   **Re-run `pip-audit` rather than trusting this paragraph.** Advisory counts
   are a snapshot; this one is from 2026-09-06.

### Still open — each needs a call before the app holds real user data

1. **The app connects to Postgres as the `postgres` superuser**, using a
   password stored in `backend/.env` (gitignored, but plain text on disk).
   Create a least-privilege role owning only the app's tables before this runs
   anywhere but a dev machine. Transport to the database is now forced —
   `sslmode=require` is appended to a Postgres URL that does not specify TLS
   whenever `ENVIRONMENT` is not a development one — but the *identity* the app
   connects as is unchanged.
2. **Nothing is encrypted at rest.** `medications`, `intake_assessments`,
   `medication_reminders` and `appointments.reason_for_visit` hold health data
   in plaintext columns. This is the largest remaining gap and is not fixable
   with application code alone — it needs a column-encryption or
   encrypted-storage decision.
3. **The dev database holds a real email address** entered through the sign-up
   UI. CLAUDE.md requires synthetic-only dev data; either treat this database
   as containing real PII or clear it.
4. **There is no token revocation and no refresh flow.** A stolen access token
   is valid until it expires. `jti` is minted so a denylist can be added.
   The token is now also at rest on the device between page loads — in the
   platform keystore on native, in `sessionStorage` in a browser — so a
   compromised device yields a live session as well as a live process. See
   "The session survives a reload, and dies with the tab".
5. **Signup discloses whether an address is registered.** Kept deliberately;
   closing it means adding email verification. See "Sign-in" above.
6. **The rate limiter is per-process and in-memory.** Two uvicorn workers mean
   two budgets. Put a real limiter at a reverse proxy before this is reachable
   by anyone untrusted.
7. **Nothing writes an access log or an audit trail of reads.** There is no
   record of who read which record, which is normally a requirement wherever
   the BAA question above is being asked.
8. **The mobile build tree has known-vulnerable dev dependencies**, via Expo
   51's CLI and React Native 0.74's. `npm audit` reported 43; it now reports 6,
   after `overrides` in `mobile/package.json` pinned the patched transitive
   versions of `tar`, `postcss`, `ajv`, `send`, `uuid`, `fast-xml-parser`,
   `@xmldom/xmldom` and `decode-uri-component`.

   ⛔ **This finding used to say "none ships in the app bundle". That was
   wrong**, and the correction is the reason the overrides exist rather than
   being deferred with the rest. `decode-uri-component` is reached at runtime
   through `query-string` ← `@react-navigation/core`, and its code was verified
   present in the exported web bundle by grepping for the library's own
   regexes. Its advisory is a denial of service via exponential decoding of
   malformed percent-encoded input — reachable from a crafted URL, so it was a
   real property of the deployed site, not of the build machine. The patched
   0.5.0 replaces that with a single left-to-right scan; the old matcher is
   gone from the bundle and the new one is in, both checked by grep.

   The remaining 6 are one chain: `image-size` ← `metro` ← `metro-config` /
   `metro-transform-worker` ← `@react-native/community-cli-plugin` ←
   `react-native`. **`image-size` has no fixed release at all** — every
   published version including the latest (2.0.2) sits inside the advisory's
   vulnerable range, so there is nothing to pin. It is Metro's, used at build
   time, and clears only with the React Native upgrade.

   Everything still deferred here is genuinely build tooling — Expo CLI, Metro,
   the native-prebuild tooling, the dev static server — so the risk is to the
   machine that builds, not to a user's data. The real fix remains an Expo
   major upgrade, still to be scheduled rather than forced; the overrides are a
   stopgap and are commented as one.

   ⛔ **The overrides are verified against `npm test` and
   `expo export --platform web` only.** Neither exercises `expo prebuild` or an
   EAS native build, which is where forcing majors into `@expo/plist`, `xcode`
   and the RN CLI would surface first. Anyone doing a native build should
   expect to re-check them there.
9. **A dev-only classification log exists** (`backend/app/core/triage_log.py`,
   flag `TRIAGE_LOG_CLASSIFICATIONS`). It writes the description and the
   follow-up answers to the application log, which CLAUDE.md otherwise
   forbids. It is off by default and refuses to run when
   `ENVIRONMENT=production`, regardless of the flag. It exists to tune the
   classifier against **synthetic input only**. Switching it on anywhere a
   real user has typed into the app would be a reportable data-handling
   failure — and the production check guards one environment name, not you.

⛔ **None of this makes the app safe to put in front of real patients.** The
release blockers above it — clinical sign-off on the triage instrument, legal
sign-off on medical-device status, a BAA with every vendor, encryption at rest
— are unchanged by any of these fixes. What changed is that the app is no
longer trivially breakable by someone who has read its source or joined its
Wi-Fi.

## Local Dev

See [README.md](README.md) for how to run the mobile app and backend locally.
