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

Two project subagents are configured in `.claude/agents/`:

- **compliance-reviewer** — invoke on any change to UI copy or logic that
  touches symptoms, conditions, or health recommendations. Checks for missing
  disclaimers, unsupported/implied medical claims, and PHI handling issues.
- **tester** — invoke to write tests for new features as they're built.

Use `compliance-reviewer` before merging anything under `mobile/src/screens/symptom-lookup/`,
`backend/app/api/symptoms.py`, or similar, and any time new user-facing copy
mentions a condition, symptom, drug, or dosage.

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

### Third-party vendor: NLM / MedlinePlus — BAA status

Every symptom search is transmitted to `wsearch.nlm.nih.gov`, a third party,
carrying free-text health input written by the user.

- **No BAA is in place, and NLM does not sign one.** If this app ever handles
  data covered by HIPAA, this call path needs a privacy/legal decision — not
  an engineering one. Options include proxying with the query stripped of
  identifiers, licensing a redistributable dataset and serving it locally, or
  accepting the exposure with user consent.
- The search screen shows a user-visible notice that searches leave the app.
- Searches are sent via **POST**, never as a URL query string, so the text
  stays out of access logs, proxies, and crash reporters.
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

### How the safety architecture works

Read `backend/app/core/triage.py` before changing any of it. Four properties
hold, each asserted by tests in `backend/tests/test_triage.py`:

1. Deterministic red-flag screening runs **first**, on every request. A match
   sets a floor of EMERGENT before the model is consulted.
2. The model can only **escalate**. Tiers are reconciled with `max()`, so a
   model answer of SELF_CARE cannot lower a red-flag EMERGENT.
3. Failure is **never** SELF_CARE. If the model errors, times out, refuses, or
   returns something unparseable, the request fails with a 503 that points the
   user at real care. It never falls back to reassurance.
4. The prompt forbids diagnostic language ("you have X") and treatment advice,
   and instructs escalation whenever uncertain — including when the
   description is vague or too short to judge.

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

## Local Dev

See [README.md](README.md) for how to run the mobile app and backend locally.
