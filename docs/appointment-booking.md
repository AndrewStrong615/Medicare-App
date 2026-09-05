# Appointment booking: what was researched, and what was built

Written 2026-08-29, before and during the build of the appointment feature.
Read this before extending it, and before promising anyone that MedHelp books
appointments — it does not.

## Summary

**Real booking was not available to this project, and the reason is not
engineering.** Every provider-scheduling API that can actually place a booking
requires (a) a signed partnership, (b) provider-side opt-in, and (c) a Business
Associate Agreement. MedHelp has none of the three, and CLAUDE.md records that
it has no BAA with any vendor at all.

So the feature that was built is the fallback: a **real provider directory**
plus an **in-app appointment record**, with the transmission step explicitly
absent and labelled as absent. Nothing about the flow is mocked to look
functional. The user is told, on three separate screens, that MedHelp has not
contacted the clinic and that they still need to call.

## 1. Booking APIs that exist, and what they need

### Zocdoc for Developers

The closest thing to a turnkey answer, and it does support real booking:
`GET /v1/provider_locations/availability` returns genuine timeslots, and
`POST /v1/appointments` books one.

- **Access:** not self-serve. There is no public developer portal that issues a
  key. You apply to the partner program, are vetted by a partnerships team, and
  sign an agreement first. Budget several weeks.
- **Who gets approved:** US healthcare providers and software vendors building
  tools *for providers*. Reporting from developers who have been through it
  says consumer apps are generally **not** approved — which is what MedHelp is.
- **Provider opt-in:** you can only book with providers in Zocdoc's network who
  have enabled it. Coverage is real but partial, and concentrated in metros.
- **Booking payload is heavy PHI:** first name, last name, date of birth, sex
  assigned at birth, phone, email, full address, and a visit reason ID. That is
  an identified patient record plus a reason for care, going to a third party.
- **BAA:** Zocdoc will sign one. Note their BAA does not cover everything on
  their platform — searches for providers, analytics, device/IP data and
  ad-network data are carved out.
- **Pricing:** not published. Assume a commercial negotiation.

### Epic (and other EHR-hosted scheduling)

Epic exposes scheduling over FHIR, including the `Appointment.$find` and
`Appointment.$book` operations, and slots must be ones the provider has
pre-designated.

- The specifications are free to read and there is no fee to work with an Epic
  customer that licenses the API.
- **But write access is the hard part.** Creating an appointment needs specific
  permissions, extra security review, and **site-by-site approval from each
  health system**. You are not integrating with "Epic"; you are integrating
  with one hospital at a time, each with its own review.
- Several scheduling endpoints remain proprietary rather than FHIR, so real
  workflows mix both.
- Oracle Health/Cerner, athenahealth and the rest are the same shape: per-org
  onboarding, not a public API.

This is a viable path for an app with a health-system partner. It is not a path
for an app with none.

### Scheduling infrastructure (Cal.com, Nylas, OnSched)

These are genuinely self-serve, have sandboxes, and Cal.com will do a BAA. But
they are the wrong tool: they host **your** calendar, or a calendar for a
provider **you have onboarded**. They come with no provider network. Using one
would mean MedHelp recruiting clinics one by one and running their scheduling —
a different company, not a feature.

### What was rejected outright

- Anything that redirects to Google Maps, a booking site, or search ads. That
  was the pre-existing behaviour on the URGENT tier and the brief was to remove
  it. It also drops a person who has just been told to seek care soon into a
  page of ads.
- Inventing slot times to make the UI look complete.

## 2. The directory that *is* real: NPPES

`https://npiregistry.cms.hhs.gov/api/` — the CMS National Plan and Provider
Enumeration System. Free, public, no key, no registration, no rate-limit
paperwork. It is the authoritative US registry of enumerated providers.

Used in `backend/app/services/provider_directory.py`. What it gives:

- Provider and organisation names, NPI, practice address, phone, and taxonomy
  (specialty).
- Search by postal code and taxonomy description.

What it does **not** give, and cannot be made to give:

- **Any availability whatsoever.** No slots, no calendars, no "next available".
- Coordinates, hence no radius search and no distance. Distance is computed on
  the phone from the device's own location (`locationService.ts`) and shown as
  a `~` estimate between ZIP centroids — straight-line, not driving.
- Whether a provider is accepting patients, open now, or in-network. The UI
  says so rather than letting the list imply it.

### Why this vendor needed no BAA decision

The outbound query is a **5-digit ZIP and a care setting** from a fixed list.
No symptom text, no name, no identifiers. A care *setting* ("Urgent Care") says
nothing about the person asking, which is why the API refuses a free-text
specialty — "Oncology" in a query log would. A test asserts the outbound
parameter set.

This is deliberately unlike the MedlinePlus path documented in CLAUDE.md, where
symptom keywords do leave the app and the BAA question is live.

## 3. What was built

| Piece | Status |
| --- | --- |
| Provider search by ZIP and care setting | **Real.** Live CMS data. |
| Provider details, address, phone, NPI | **Real.** |
| Distance from the user | **Real**, on-device, labelled an estimate. |
| Appointment record, carried reason for visit and urgency | **Real.** Stored, user-scoped. |
| Appointment tracking list, status changes | **Real.** |
| Slot/availability display | **Absent by design.** No source exists. |
| Transmitting a request to the provider | **Absent by design.** No BAA-covered channel. |

`backend/app/services/request_delivery.py` is the seam for the last row. It
raises rather than returning quietly, so nothing can accidentally report
success for a request that went nowhere. `delivery_available()` returns False,
the API returns `online_booking_available: false`, and the UI reads that flag
rather than hard-coding the assumption — so the day a channel is procured, the
screens stop under-promising instead of having to be hunted down.

## 3a. Identity: the pass-through decision

Booking needs a patient identity — Zocdoc requires legal name, date of birth,
sex assigned at birth, phone, email and full address. The decision taken was
**pass-through, not storage**: those fields are collected for one request,
transmitted, and dropped. Nothing persists them.

What that buys, and what it costs:

- **Buys:** no table of names, dates of birth and home addresses. A breach of
  the database today exposes an email and health data; storing identity would
  add the part worth stealing, on top of a database with no encryption at rest,
  a `postgres` superuser connection, and no BAA with anyone.
- **Costs:** the user retypes their details on every booking. There is no
  "remember me" without reversing the decision.
- **Does not buy:** freedom from HIPAA. Transmitting PHI makes the receiving
  vendor a business associate exactly as storing it would. Pass-through shrinks
  the breach radius; it does not remove the BAA requirement.

The invariant is enforced by tests rather than convention — see
`backend/tests/test_booking_identity.py` and the CLAUDE.md section "Patient
identity is pass-through". The structural check inspects the mapped SQLAlchemy
table, so a column added by any future route fails the suite.

The whole path — endpoint, form, validation, error states — is built and
tested, and **gated off**. `delivery_available()` returns False, so the
endpoint refuses with a 503 before processing an identity, and the app never
renders the form. No identity is collected today, because there is nowhere to
send it and collecting the most sensitive data in the app for no purpose would
be worse than not having the screen.

## 4. What a real booking integration would require

In order:

1. A **legal decision** on BAAs — this project has none with anyone, and the
   booking payload above is squarely PHI.
2. A **partnership**: either Zocdoc (and MedHelp likely does not qualify as a
   consumer app) or a named health system for an EHR integration.
3. **Provider opt-in**, per provider or per organisation.
4. A decision on what identity MedHelp holds. Booking needs legal name, DOB,
   sex assigned at birth, address. MedHelp currently stores an email and a
   password. That is a much larger identity surface, and it needs its own
   review.
5. Only then: replace `deliver_request`, flip `delivery_available()`, and let
   the existing `providerNotified` path light up. The identity form, the submit
   endpoint and the confirmation screen's "booked" state all become reachable
   from that one flag — no component needs editing.

⛔ `delivery_available()` is not a feature flag. It stands for a signed BAA and
a scheduling partnership. Flipping it to see the UI starts transmitting patient
identity and a reason for visit to a vendor with no agreement in place.

## 5. Open questions for the user

- ~~Whether MedHelp should hold patient identity at all.~~ **Decided:
  pass-through — collected per booking, transmitted, never stored.** Revisit
  only if retyping proves to be a real barrier for users, and only after
  encryption at rest exists.
- Whether the appointment reason — a copy of the intake description in the
  URGENT flow — should be stored at all before encryption at rest exists. It is
  currently stored in the clear, like `intake_assessments` and `medications`.
- Whether an emailed/faxed request to a clinic is wanted once a BAA exists, or
  whether to wait for live scheduling.
