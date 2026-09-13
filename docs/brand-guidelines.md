# MedHelp brand guidelines

Source of truth for the visual identity. The implementation lives in
`mobile/src/theme.ts`; where this document and that file disagree, the file is
what ships and this document is the bug.

⛔ Nothing in here overrides `CLAUDE.md`. The reviewed safety colour families,
the disclaimer copy and placement, and every triage and emergency module are
fenced, and a brand decision is never a reason to touch one.

## The idea: MedHelp is drawn on chart paper

Every clinical record in existence sits on a ruled grid — ECG strips, growth
charts, flowsheets, telemetry, the anaesthetic record. It is the most
recognisable clinical surface there is and no consumer health product uses it,
because they all reach for flat white.

It is also true to what this app actually does. MedHelp's whole structure is a
day on an axis: reminder times, refill run-out dates, appointment times, a
weekly rhythm for a goal. Ruled paper is the substrate that axis belongs on.

Everything below follows from that one decision.

## Voice

MedHelp's defining trait is **refusal**. It does not diagnose, does not book,
does not decode a dose, does not score adherence. That is not an apology — it
is the product, and the identity should carry it proudly rather than bury it.

- **Plain, declarative, unhedged about its own limits.** "MedHelp has not
  contacted anyone." Not "we may not have been able to contact the provider."
- **Never reassuring about health.** The app has no basis for reassurance.
  A time that has passed is "Earlier today", never "missed" and never "well
  done".
- **A control says exactly what it does**, and keeps the same name through the
  flow: "Check my symptoms" leads to a screen about symptoms.
- **Empty and failed states give direction, not mood.** An empty screen says
  what to do next; an error says what happened and how to fix it.
- **The refusals go where they are read.** They are the sub-line on the
  destination band, not grey type at the bottom of a card.

## The mark

One cell of the chart paper: a hard-cornered square quartered by a
cross-shaped gutter, the gutter one grid unit wide. It reads two ways at
once — the gutter is a health cross, the four cells are a square of ruled
paper. `mobile/src/components/Mark.tsx`.

| | |
|---|---|
| Minimum size | 20pt. Below that the gutter stops resolving. |
| Clear space | One grid unit (8pt) on every side. |
| Gutter | Always set to the colour the mark sits on. |
| Quadrants | `accentDeep` by default; a destination hue on that destination's surface. |

**Never**: round the corners, add a radius, outline it, tilt it, place it on a
busy ground, or restore the previous plus-in-a-rounded-square. The radius is
precisely what made the old mark indistinguishable from a thousand clinics,
insurers and pill trackers, and it said only "medical" — which the word
*MedHelp* beside it already said.

`Wordmark` is the mark plus the name in Archivo ExtraBold at 0.72× the mark's
size. Use it in the rail and on the phone's Today header; never set the name
in a different face.

## Colour

### Destinations

Five places a signed-in person can be, five hues on one continuous sweep from
teal to magenta. They are **saturated on purpose** — an earlier pass matched
all five to the same contrast against white, which made the set systematic and
completely forgettable. What holds it together is the unbroken arc of hue, not
that the five are interchangeable.

| Destination | Fill / ink | White on it | On porcelain |
|---|---|---|---|
| Today | `#00707F` | 5.8:1 | 5.2:1 |
| Symptoms | `#1150D6` | 6.7:1 | 5.9:1 |
| Medications | `#5B2BEA` | 7.1:1 | 6.3:1 |
| Care | `#9B1FD0` | 6.0:1 | 5.3:1 |
| Goals | `#C40B8A` | 5.6:1 | 5.0:1 |

Each also carries a `pressed`, a `surface` tint and a `border` — see `domains`
in `theme.ts`. Change one and re-measure the set, not just the one.

⛔ **A hue means a place.** Never a state, never a severity, never anything
about the person's health. If you are choosing a hue from what the *data* says
rather than from which screen this is, stop.

⛔ **The ramp stops before red, amber and green**, and that is structural. Those
hues belong to the reviewed safety families, so keeping every destination
colour on the cool arc means a warm colour anywhere in this app always carries
safety meaning and can never be read as decoration. This matters more now that
the rest of the palette is loud. Do not extend the ramp past magenta.

### Neutrals

Cool porcelain, not warm paper. `background #EEF2F5`, `surface #FFFFFF`,
`surfaceMuted #E5EBEF`, `surfaceSunken #DFE7EC`. Ink `#0D1B24` / `#42555F` /
`#586C7A`. Lines `#C2D1DA`, `#A3B6C2`, divider `#DEE7EC`. Deep ground
`accentDeep #08313D`.

### Safety — ⛔ do not restyle

`noticeText/Surface/Border`, `errorText/Surface/Border`,
`successText/Surface/Border`, `emergencyText/Surface/Border` are byte-for-byte
what a reviewer signed off on. A visual direction is a preference; these are a
decision someone made. They are exempt from the one-filled-action rule too:
"Call 911" stays filled however many other filled controls share the screen.

## Typography

Two families, each with one job.

**Archivo** — the app speaking. A grotesque drawn from nineteenth-century
American gothics and built for signage, which is right for an app whose main
job is telling you where to go.

**Newsreader** — the app quoting. Only ever text a *person wrote* or a *source
published*: the symptom field, the emergency card's values, a MedlinePlus
summary. That split is what stops a paraphrase ever being dressed as a
quotation.

| Role | Token | Face | Size |
|---|---|---|---|
| Destination band | `band` | Archivo ExtraBold | 34 / -1.2 |
| Page title | `displayLarge` | Archivo ExtraBold | 36 / -1.1 |
| Screen title | `display` | Archivo Bold | 30 / -0.6 |
| Block title | `title` | Archivo SemiBold | 21 |
| Body | `body` | Archivo Regular | 17 |
| Quoted | `bodyQuoted` | Newsreader Regular | 19 / 31 |
| Value | `data` | Archivo SemiBold, tabular | 16 |
| Label | `overline` | Archivo Bold | 13 |

⛔ **Set `fontFamily`, never `fontWeight` or `fontStyle`.** Each weight is a
separate file; asking for bold on a bold face gets a synthetic double-bold.

⛔ **Import faces by their per-weight subpath**, never from the package root —
a root import bundles all 32 faces. See the note in `App.tsx`.

⛔ **Labels are sentence case.** Uppercasing costs a word its outline shape,
which is most of what makes a label readable at a glance; the tracking and the
weight already do that job. The 13pt floor on `overline` is an accessibility
decision and outranks any mockup.

**Figures are tabular** wherever they line up in a column — times, doses,
dates, distances.

## Layout

**The ground is ruled.** `assets/chart-grid.png`, a 40pt tile with a rule every
8pt and a heavier one every 40, baked opaque over `background`. It stays under
the content and never behind text: cards and notices are opaque and sit on top,
exactly as a label sits on chart paper. ⛔ Do not raise its contrast — roughly
5% and 10% ink is enough to read as texture and not enough to interfere with a
word, and this app is read by people who are unwell.

**The band** is the destination's colour at the size of a sign, carrying its
name knocked out in ExtraBold and one plain sub-line. A colour that only ever
appears as a hairline is a footnote, not an identity.

**The meter** is a 4pt colour edge down the leading side of every screen — the
band continuing past the corner. On Today it becomes a real time axis. ⛔ It is
never the only carrier of anything: whatever it says, the screen says in words.

**The prominence ladder**: one filled action per screen, in that screen's hue.
L2 surface + hairline, L3 muted fill, L4 a rule and a footnote. See
`PROMINENCE_LEVELS`.

**Radii vary by what a thing is** — 6 chips and tiles, 10 controls, 14 cards,
18 panels. One radius everywhere flattens hierarchy.

**Depth is almost nothing.** Structure is carried by hairlines, the grid and
the band. Shadows are tinted with the deep ink, never black.

## Iconography

Geometric marks drawn from Views — no icon font, no SVG library, no network
request for decoration. Every glyph sits beside a text label, never in place of
one, and is hidden from assistive technology. ⛔ Nothing in this app is
communicated by a picture alone.

## Imagery

There is none, deliberately. No stock photography of smiling people, no
illustration of a body, no chart of anyone's health. A picture of a person
looking well is a claim this app cannot make, and a diagram of a symptom is
clinical content an agent may not author. The grid, the bands and the type are
the whole visual system.
