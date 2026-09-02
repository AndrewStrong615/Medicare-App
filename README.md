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

cp .env.example .env

# Generate a real signing key. There is no usable default: the old placeholder
# was published in .env.example, so anyone who had read this repo could mint a
# token for any account. Paste the output into JWT_SECRET_KEY in .env.
python -c "import secrets; print(secrets.token_hex(32))"

# create the database referenced by DATABASE_URL, e.g.:
#   createdb medhelp_dev

uvicorn app.main:app --reload
```

The API will be at `http://localhost:8000`. Interactive docs at
`http://localhost:8000/docs` (development only — `/docs`, `/redoc` and
`/openapi.json` are not served when `ENVIRONMENT` is anything else).

If you skip the key generation step, the API still starts in development, but
it warns and mints a **random key per process** — so every restart signs you
out. With `ENVIRONMENT` set to anything other than `local`/`dev`/`development`/
`test`/`testing` it refuses to start at all rather than run on a public key.

### Serving the API over https

Plain `http://192.168.x.x` puts every email, password and symptom description
on the LAN in the clear, readable by anyone on the same Wi-Fi. It is also why
the "Use my location" button cannot work in a browser — the Geolocation API is
refused outside a secure context.

Generate a self-signed certificate covering localhost and this machine's LAN
addresses, then serve over TLS:

```bash
cd backend
python scripts/generate_dev_cert.py          # writes backend/certs/ (gitignored)

uvicorn app.main:app --host 0.0.0.0 --port 8000   --ssl-keyfile certs/dev-key.pem --ssl-certfile certs/dev-cert.pem
```

Serve the web build over https too, so the page and the API agree on scheme —
a page on `https://` cannot call an `http://` API, browsers block it as mixed
content:

```bash
cd mobile
npx expo export --platform web
npx serve dist -l 8082 --ssl-cert ../backend/certs/dev-cert.pem   --ssl-key ../backend/certs/dev-key.pem
```

Then open `https://192.168.x.x:8082` on the phone. The first visit shows a
certificate warning on each device: the certificate is self-signed, so it
**encrypts but does not authenticate**. Traffic on the wire is unreadable;
nothing proves the server is the one you meant, so this does not stop someone
on the network impersonating it. For real users, get a certificate from a CA
against a real hostname instead.

If you have added a feature with a new table (e.g. `appointments`), create it —
Alembic is not wired up yet, so nothing does this at startup:

```bash
cd backend
python scripts/create_missing_tables.py
```

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

### Where the app looks for the backend

**Leave `EXPO_PUBLIC_API_BASE_URL` unset.** With no override, the web build
looks for the API on port 8000 of *whatever host served the page*. One build
then works everywhere: open it at `localhost:8082` on this machine, at
`192.168.x.x:8082` from a phone on the same Wi-Fi, or at a mesh address from
anywhere — and the API is found beside it each time, with nothing to
reconfigure.

Setting the variable is what breaks that. It is inlined into the bundle at
build time, so `EXPO_PUBLIC_API_BASE_URL=http://192.168.1.5:8010` pins every
install to one LAN address and the app stops working the moment the phone
leaves that network. Only set it when the API genuinely lives somewhere the
page host cannot imply:

```bash
EXPO_PUBLIC_API_BASE_URL=http://<host>:<port> npm start
```

### Using it away from the server's Wi-Fi

A LAN address only works while the phone is on that LAN. To use the app from
any network, put both machines on a WireGuard mesh (Tailscale or similar) and
open the app at the *mesh* address:

```
http://100.x.y.z:8082
```

The API is then found at `http://100.x.y.z:8000` automatically. `baseUrl.ts`
treats `100.64.0.0/10` as safe for plain http, on the same grounds as
loopback — WireGuard has already encrypted the traffic, and the address is not
publicly routable.

⛔ **Do not expose this backend to the open internet** — no tunnel, no port
forward. The specific holes this warning used to name are closed: every route
now requires a bearer token and filters on the caller, CORS is an explicit
allowlist, sign-in is rate limited, and the signing key can no longer be the
published placeholder. What is still missing is the rest of a production
posture — no encryption at rest, no BAA with any vendor, no reviewed clinical
content, a self-signed certificate at best, and a database reached as the
`postgres` superuser. See "Open data-handling findings" in CLAUDE.md.

A mesh gives you access from anywhere without any of that becoming a public
problem.

Run mobile tests:

```bash
cd mobile
npm test
```

## Staying signed in

Refreshing the page no longer signs you out. The session token is kept in the
platform keystore on iOS and Android, and in `sessionStorage` in a browser —
so it survives a reload, and in a browser it ends when the tab does. Sign out
from the button on the home screen.

Two consequences worth knowing:

- **A new tab starts signed out.** `sessionStorage` is per tab. That is
  deliberate: this token reads someone's medications and symptom assessments,
  and it should not outlive the tab on a shared computer.
- **Signing out ends the session on the device only.** There is no server-side
  revocation yet, so the token stays valid until it expires (60 minutes).

Checked in real Chrome — sign-in, two reloads, sign-out, and an expired token.
No backend needed; the sign-in call is stubbed:

```bash
cd mobile && npm run e2e:web:session
```

The native side uses `expo-secure-store`, which is a native module: if you
have a development build from before this change, rebuild it.

## Appointments and provider search

The app can search a real provider directory (NPPES, published by CMS — free,
no API key) and record an appointment against a provider.

**It does not book appointments.** No scheduling API is connected, and no
provider has opted in, so MedHelp never contacts a clinic: it keeps the details
and tells the user to call. Availability/slot times are not shown anywhere,
because no source for them exists. See
[docs/appointment-booking.md](docs/appointment-booking.md) for what was
researched and what it would take to make booking real, and CLAUDE.md for the
rules on extending it.

Provider search prefills the ZIP code from your location, by a different route
on each platform:

| | Position from | ZIP from |
|---|---|---|
| iOS / Android | `expo-location` (needs a development build) | the OS geocoder, on the device |
| Browser | `navigator.geolocation` | `POST /providers/resolve-location` |

The split exists because browsers have no geocoder. Everything above that one
function — the search, the results, the appointment flow — is shared code. No
third-party geocoding service is used on either platform; the browser path
resolves against a US Census dataset held by our own backend. On native the
coordinates never leave the phone; on web they reach MedHelp's backend only.

**Geolocation in a browser needs HTTPS or `localhost`.** Served to a phone at
`http://192.168.x.x` the browser refuses it outright, whatever the user
chooses — so typing a ZIP is the path there, and the app says so. Only the
5-digit ZIP is ever sent onward to CMS.

Distances are computed by the backend and work on every platform. The two ends
are measured differently: the **provider's** end is their street address,
geocoded against the US Census Bureau's free public geocoder and cached by NPI,
while **your** end is the centre of the ZIP you searched — which is all the app
is told about where you are.

So "~2.5 mi" means *about two and a half miles from the middle of your ZIP
code*. Straight line, rendered with a "~", never a driving distance.

Geocoding the provider address is what stops a whole page reading "~0.0 mi":
the directory is searched by exact ZIP, so most results are *in* your ZIP, and
a ZIP centroid is zero miles from itself. Only providers' public business
addresses are sent to the geocoder — never anything about you. A provider that
cannot be placed shows no distance rather than a misleading zero.

Real-browser tests (actual Chrome, real permission behaviour):

```bash
cd backend && uvicorn app.main:app --port 8000   # in one terminal
cd mobile && npm run e2e:web                     # in another
```

To rebuild the ZIP centroid dataset from the Census (rarely needed — the
extract is committed):

```bash
cd backend && python scripts/build_zip_centroids.py
```

## Current state

This is an initial scaffold: placeholder auth, navigation stubs for symptom
lookup and medication reminders, no real medical/clinical content, no
encryption-at-rest, no BAA-covered vendors selected. See CLAUDE.md's "Known
Gaps" section before assuming any of that is production-ready.

## Data safety

Never put real patient/health data anywhere in this repo — dev and test data
must be synthetic only. See CLAUDE.md "Data Rules".
