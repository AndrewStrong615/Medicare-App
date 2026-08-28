# MedHelp

An informational-only app for looking up general symptom/condition info and
setting medication reminders. It does not diagnose or recommend treatment —
see [CLAUDE.md](CLAUDE.md) for full scope, data handling, and compliance rules
before working on anything here.

## Project layout

```
.
├── CLAUDE.md              Scope, data rules, and conventions for this repo
├── mobile/                React Native (Expo) + TypeScript frontend
├── backend/                FastAPI + PostgreSQL backend
└── .claude/agents/         compliance-reviewer and tester subagent configs
```

## Prerequisites

- Node.js 18+ and npm
- Python 3.11+
- PostgreSQL running locally (or Docker)
- [Expo Go](https://expo.dev/client) app on your phone, or an iOS/Android
  simulator, to run the mobile app

## Backend — run locally

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env        # then edit DATABASE_URL / JWT_SECRET_KEY as needed
# create the database referenced by DATABASE_URL, e.g.:
#   createdb medhelp_dev

uvicorn app.main:app --reload
```

The API will be at `http://localhost:8000`. Interactive docs at
`http://localhost:8000/docs`.

Run backend tests:

```bash
cd backend
pytest
```

## Mobile — run locally

```bash
cd mobile
npm install
npm start
```

This opens the Expo dev tools; scan the QR code with Expo Go, or press `i`/`a`
to launch an iOS/Android simulator.

By default the app talks to `http://localhost:8000`. To point at a different
backend (e.g. when testing on a physical device, which can't reach
`localhost` on your dev machine), set `EXPO_PUBLIC_API_BASE_URL`:

```bash
EXPO_PUBLIC_API_BASE_URL=http://<your-machine-ip>:8000 npm start
```

Run mobile tests:

```bash
cd mobile
npm test
```

## Current state

This is an initial scaffold: placeholder auth, navigation stubs for symptom
lookup and medication reminders, no real medical/clinical content, no
encryption-at-rest, no BAA-covered vendors selected. See CLAUDE.md's "Known
Gaps" section before assuming any of that is production-ready.

## Data safety

Never put real patient/health data anywhere in this repo — dev and test data
must be synthetic only. See CLAUDE.md "Data Rules".
