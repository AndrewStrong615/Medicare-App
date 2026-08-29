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
  no real token refresh flow, no real session invalidation).
- No encryption-at-rest implementation yet (see Data Rules above).
- No BAA-covered vendors selected yet.
- Medication reminders and appointments are not built yet.

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
- A topic is only shown if its **title contains a word the user wrote**
  (`title_matches`). The upstream ranking is loose — "swollen ankle" returns
  "Diabetic Heart Disease" above anything about ankles, and printing that
  under someone's description reads as a suggested diagnosis. Non-matching
  topics are dropped, never reordered: ranking health topics by relevance
  would be a clinical judgement this app may not make.
- **Known limit:** the filter is lexical, so a context word that happens to
  name a topic still gets through — "my head has been pounding" returns
  "Head and Neck Cancer", "nauseous after eating" returns "Eating Disorders".

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
  body-part word to match empties the good cases ("swollen ankle" → nothing)
  and corrupts others ("my lower back hurts" → "How to Lower Cholesterol",
  matching on *lower*). Telling a location word from a symptom word is a
  semantic judgement, so the realistic fix is model-assisted topic selection
  — still retrieval, not authoring — which needs its own review.
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
- **The clarifying questions are in scope for the clinical review.** The four
  prompts in `app/core/followup.py` (location, duration, severity 1-10,
  associated symptoms) are elicitation, not screening — no threshold, no
  hypothesis test — but which questions get asked shapes what the classifier
  sees, so a reviewer should read them as part of the instrument rather than
  as UI copy. The severity scale in particular is a number the app collects
  and does not act on; a reviewer should say whether that is right.
- **The model may now decline to classify** (`NEEDS_MORE_INFO`), which is not
  a fourth tier and cannot be ranked against one. It only adds a question; the
  rule tier stands underneath it, and asking is capped at one round after
  which the safe default (URGENT) is applied and stated plainly. A reviewer
  should confirm that a single round of questions is the right cap.
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

Not yet reviewed by a clinician or by counsel. Scanning does not estimate
urgency and authors no clinical content, so it is not covered by the intake
blocker below — but the parsing heuristics have only been tested against
synthetic labels written by an engineer, not against a corpus of real ones.

## Open data-handling findings (awaiting a decision)

Found during review, deliberately not changed. Each needs a call before the
app holds real user data:

1. **Passwords are echoed in 422 responses.** Pydantic includes the rejected
   value in validation errors, so a too-short/too-long password comes back in
   the response body (`detail[].input`) and can reach client logs, proxies,
   and crash reporters. Fix by stripping `input` from validation error
   responses (custom `RequestValidationError` handler) or marking the field
   so it is not echoed.
2. **`GET /medications/reminders` is unscoped.** It returns every row for
   every user. Inert today (no auth on the route, no real data), but it is
   the exact shape of a PHI leak and must be filtered by the authenticated
   user in the same change that wires auth into protected routes — with a
   test asserting cross-user access is denied.
3. **The app connects to Postgres as the `postgres` superuser**, using a
   password stored in `backend/.env` (gitignored, but plain text on disk).
   Create a least-privilege role owning only the app's tables before this
   runs anywhere but a dev machine.
4. **`decode_access_token` is never called.** No route is actually protected,
   so login currently grants a token that nothing checks.
5. **The dev database holds a real email address** entered through the sign-up
   UI. CLAUDE.md requires synthetic-only dev data; either treat this database
   as containing real PII or clear it.
6. **CORS is `allow_origins=["*"]`** so the Expo web preview can call the API.
   Scope it to known origins before any non-local deployment.
7. **A dev-only classification log exists** (`backend/app/core/triage_log.py`,
   flag `TRIAGE_LOG_CLASSIFICATIONS`). It writes the description and the
   follow-up answers to the application log, which CLAUDE.md otherwise
   forbids. It is off by default and refuses to run when
   `ENVIRONMENT=production`, regardless of the flag. It exists to tune the
   classifier against **synthetic input only**. Switching it on anywhere a
   real user has typed into the app would be a reportable data-handling
   failure — and the production check guards one environment name, not you.

## Local Dev

See [README.md](README.md) for how to run the mobile app and backend locally.
