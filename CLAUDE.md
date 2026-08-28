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
- No emergency-detection logic yet — `docs/emergency-guidance.md` is not
  written.
- No real symptom/condition/medication content — screens are navigation
  stubs only.

## Local Dev

See [README.md](README.md) for how to run the mobile app and backend locally.
