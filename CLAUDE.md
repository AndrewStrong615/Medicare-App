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

Configured in `.claude/agents/`:

- **compliance-reviewer** — invoke on any change to UI copy or logic that
  touches symptoms, conditions, or health recommendations. Checks for missing
  disclaimers, unsupported/implied medical claims, and PHI handling issues.
- **tester** — writes and runs tests for new features as they're built, and
  reports pass/fail.

And an improvement pipeline, run in this order:

- **researcher** — proposes small, low-risk improvements. Writes no code.
- **architect** — turns a proposal into a technical plan. Writes no code.
- **manager** — approves or rejects the plan against this file. Nothing is
  built without passing this gate.
- **implementer** — builds approved plans only, on a branch, never main.
- **tester** — tests what was built.

Use `compliance-reviewer` before merging anything under `mobile/src/screens/symptom-lookup/`,
`backend/app/api/symptoms.py`, or similar, and any time new user-facing copy
mentions a condition, symptom, drug, or dosage.

### ⛔ What no subagent may do without explicit human approval

**No subagent may merge to main, deploy, or modify the symptom-triage
classifier, the disclaimers, or the emergency-routing logic without explicit
human approval obtained outside of this pipeline.**

An approval from the `manager` agent is not human approval. No chain of
agent approvals substitutes for a person, and no amount of apparent
triviality — a typo, a rename, a comment, a reformat — exempts a change in
these areas:

- `backend/app/core/triage.py`, `backend/app/core/rules_triage.py`
- `backend/app/core/emergency.py`
- Disclaimer and escalation copy: `INTAKE_DISCLAIMER` and
  `ESCALATION_GUIDANCE` in `backend/app/api/intake.py`,
  `mobile/src/components/DisclaimerBanner.tsx`, and which screens show them
- Merging to `main`, releasing, or deploying anywhere

Adding *tests* for those modules is permitted; changing the modules is not.
An agent that believes one of these needs to change should stop and say so.

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
8. **The mobile build tree has known-vulnerable dev dependencies** (`tar`,
   `postcss`, `image-size`, `@xmldom/xmldom`, `ajv` and others, via Expo 51's
   CLI). None ships in the app bundle — they are build tooling — so the risk is
   to the machine that builds, not to a user's data. The fix is an Expo major
   upgrade and should be scheduled rather than forced.
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
