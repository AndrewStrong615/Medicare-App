/**
 * Design tokens for MedHelp.
 *
 * This is a health app that people may open while worried or in a hurry, so
 * the type scale is a little larger than a typical consumer app and colour is
 * never the only carrier of meaning — errors and emergencies also change
 * wording and iconography.
 *
 * All text/background pairings below meet WCAG AA (4.5:1) at minimum; the
 * ratio is noted where it is close enough to be worth protecting during
 * future palette changes.
 *
 * ## The 2026 "panel" pass
 *
 * The app is not a dashboard, it is a **panel** — in the sense a lab report
 * is a panel. Two vernaculars feed it: hospital wayfinding, which colour-codes
 * departments so you can find one without reading; and the printed lab
 * result, which is measured, tabular and left-aligned.
 *
 * Three things changed from the paper pass that preceded this:
 *
 * 1. **The ground went from warm paper to cool porcelain.** A cream ground
 *    under a reading serif was a deliberate choice and a defensible one, but
 *    it reads domestic. This app sits next to a pharmacy label and an
 *    emergency card, and cool porcelain is the colour of the room those are
 *    handled in.
 * 2. **One accent became five.** Each destination in `AppNav` owns a hue —
 *    see `domains` below and the fence on it.
 * 3. **The type is Archivo and Newsreader.** Archivo is a grotesque with
 *    signage lineage, which is the right voice for an app whose main job is
 *    telling you where to go. Newsreader replaces Literata in the same role
 *    it always had: the app quoting somebody.
 *
 * ⛔ **The notice, error, success and emergency families are byte-for-byte
 * what a reviewer signed off on** and were not touched by this pass, because
 * those carry safety meaning. Only the neutrals, the accents, the type and
 * the depth changed. Anyone revisiting the palette should keep that line.
 */

export const colors = {
  // Surfaces — cool porcelain rather than warm paper
  background: "#EEF2F5",
  surface: "#FFFFFF",
  surfaceMuted: "#E5EBEF",
  /** Page ground behind a hero panel — one step darker than `background`. */
  surfaceSunken: "#DFE7EC",

  // Text — on `background` unless noted
  textPrimary: "#0D1B24", // 15.6:1
  textSecondary: "#42555F", // 6.9:1
  /** Quietest readable ink — section labels and footnotes. 4.9:1. */
  textMuted: "#586C7A",
  textOnAccent: "#FFFFFF",
  /** Secondary text on `accentDeep` — 7.2:1. */
  textOnAccentMuted: "#A8CEDB",

  // Lines. With depth kept almost flat, a hairline is what separates one
  // block from the next.
  border: "#C2D1DA",
  borderStrong: "#A3B6C2",
  borderFocus: "#0B5E73",
  /** Hairline between rows inside one card. */
  divider: "#DEE7EC",

  // The app-wide primary action. This is the Today hue, which is also the
  // first stop on the domain ramp — see `domains`. A screen inside a
  // destination overrides it with that destination's own colour.
  accent: "#0B5E73", // white on this: 7.3:1; on `background`: 6.5:1
  accentPressed: "#084A5B",
  accentDisabled: "#9FB8C1",
  /** Header/hero ground. White on this: 12.9:1. */
  accentDeep: "#08313D",
  /** Tinted fill for icon tiles and quiet accent chips. accent on it: 6.3:1. */
  accentSurface: "#E3EFF3",
  accentBorder: "#BBD6DF",

  // ⛔ Everything below this line is reviewed safety colour. Do not restyle
  // it to match a new visual direction — a direction is a preference and
  // these are a decision someone signed off on.

  // Errors: used for "this didn't work", not for medical urgency
  errorText: "#8C1D18", // 8.6:1
  errorSurface: "#FDECEA",
  errorBorder: "#E9A29B",

  // Confirmations
  successText: "#14532D", // 9.7:1 on successSurface
  successSurface: "#E7F4EA",
  successBorder: "#7FB98B",

  // Disclaimers: informational, must stay legible, never alarming
  noticeText: "#5E3D07", // 8.4:1 on noticeSurface
  noticeSurface: "#FFF6E5",
  noticeBorder: "#E0A02C",

  // Emergency: reserved exclusively for call-emergency-services guidance
  emergencyText: "#7A1610",
  emergencySurface: "#FDE7E5",
  emergencyBorder: "#C5362C",
} as const;

/**
 * ## One hue per destination
 *
 * The five places a signed-in person can be each own a colour, and the five
 * sit on a single ramp from teal to magenta.
 *
 * **They are saturated on purpose.** An earlier pass matched all five to the
 * same contrast against white, on the theory that equal weight is what makes
 * a set read as one system. It did — and it also made every one of them the
 * same muted mid-dark, so the ramp was systematic and completely forgettable.
 * What holds this set together is that it is one continuous sweep of hue at
 * the edge of what sRGB will give, not that the five are interchangeable.
 *
 * Each still clears AA in both of its jobs: white on the fill lands between
 * 5.6:1 and 7.1:1, and the ink on the porcelain ground between 5.0:1 and
 * 6.3:1. Change one and re-measure the set, not just the one.
 *
 * ### ⛔ A hue means a *place*, never a state and never a health fact
 *
 * `domains.medications` means "you are in Medications". It must never come to
 * mean "this medication needs attention", and no row, badge or chip may be
 * tinted by urgency, adherence, severity or any reading of the person's
 * health. MedHelp does not know whether a dose was taken; a colour that
 * implied it would be inventing a clinical fact, which is the same fence the
 * Today screen and `InfoPanel` already carry.
 *
 * ### ⛔ The ramp stops before red, amber and green, and that is structural
 *
 * Those three hues belong to the reviewed safety families above. Keeping
 * every destination colour on the cool arc means a warm colour anywhere in
 * this app always carries safety meaning — so a disclaimer, an error and
 * emergency guidance are the only warm things on any screen, and they cannot
 * be mistaken for decoration. Do not extend this ramp past magenta.
 *
 * `fill` is a ground for white text. `ink` is the same hue as text or an icon
 * on `surface` or `background`. `surface`/`border` are the quiet tinted chip.
 */
export const domains = {
  today: {
    ink: "#00707F",
    fill: "#00707F",
    pressed: "#005965",
    surface: "#DFEFF1",
    border: "#A9D6DB",
  },
  symptoms: {
    ink: "#1150D6",
    fill: "#1150D6",
    pressed: "#0D3FA8",
    surface: "#E3EAFB",
    border: "#B4C6F3",
  },
  medications: {
    ink: "#5B2BEA",
    fill: "#5B2BEA",
    pressed: "#4720B8",
    surface: "#E9E3FD",
    border: "#C6B6F8",
  },
  care: {
    ink: "#9B1FD0",
    fill: "#9B1FD0",
    pressed: "#7B18A6",
    surface: "#F2E2FA",
    border: "#DCB6F0",
  },
  goals: {
    ink: "#C40B8A",
    fill: "#C40B8A",
    pressed: "#9C096E",
    surface: "#FBDFF0",
    border: "#F2AFD8",
  },
} as const;

export type DomainName = keyof typeof domains;
export type Domain = (typeof domains)[DomainName];

/**
 * The two faces, by their loaded family names.
 *
 * ⛔ **Set `fontFamily`, never `fontWeight`.** These are separate font files
 * per weight, and asking Android for a bold weight of a face that is already
 * bold gets you a synthetically smeared double-bold. The same goes for
 * `fontStyle: "italic"` — use `serifItalic` instead of asking the renderer to
 * slant an upright face.
 *
 * The pairing is not arbitrary. **Archivo** is a grotesque drawn from
 * nineteenth-century American gothics and built for high-performance
 * signage — which is the voice this app wants, because most of what it says
 * is *where to go next*. It is tight enough to hold a dense medication list
 * and sturdy enough to set a screen title at 36pt.
 *
 * **Newsreader** is a screen reading serif, and it is used here only for text
 * a *person wrote or a source published*: what the user typed into the
 * symptom field, the values on their emergency card, a MedlinePlus summary.
 * That split is the whole idea — the serif is the app quoting, the sans is
 * the app speaking — and it is why a paraphrase can never be dressed as a
 * quotation by accident.
 *
 * Loaded once in `App.tsx`. Nothing renders until they are ready, because
 * swapping a face in after first paint reflows every screen.
 */
export const fonts = {
  serif: "Newsreader_400Regular",
  serifItalic: "Newsreader_400Regular_Italic",
  serifSemibold: "Newsreader_600SemiBold",
  serifBold: "Newsreader_700Bold",
  sans: "Archivo_400Regular",
  sansMedium: "Archivo_500Medium",
  sansSemibold: "Archivo_600SemiBold",
  sansBold: "Archivo_700Bold",
  sansExtrabold: "Archivo_800ExtraBold",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 44,
} as const;

/**
 * Corner radii, **differentiated by what a thing is** rather than one value
 * applied to everything. A single radius across an interface flattens its
 * hierarchy: a chip, a card and a full-bleed panel are not the same kind of
 * object and should not share an outline.
 */
export const radius = {
  /** Chips, tiles, the meter cap. */
  sm: 6,
  /** Inputs and buttons — a control you put a finger on. */
  md: 10,
  /** Cards and grouped lists. */
  lg: 14,
  /** A panel that owns the width of the screen. */
  xl: 18,
  pill: 999,
} as const;

/**
 * Figures that line up in a column. Times, doses, dates and counts are read
 * down a list rather than along a line, so they are set with tabular
 * (fixed-width) numerals; proportional figures make a column of 08:00 /
 * 11:15 / 20:00 jitter left and right.
 */
const TABULAR = { fontVariant: ["tabular-nums"] as "tabular-nums"[] };

export const typography = {
  /**
   * The band title — the app's one typographic moment. Heavy, tight, and
   * knocked out of a field of the destination's colour, which is how a
   * department is named on a hospital wall.
   */
  band: {
    fontFamily: fonts.sansExtrabold,
    fontSize: 34,
    lineHeight: 37,
    letterSpacing: -1.2,
  },
  displayLarge: {
    fontFamily: fonts.sansExtrabold,
    fontSize: 36,
    lineHeight: 41,
    letterSpacing: -1.1,
  },
  display: {
    fontFamily: fonts.sansBold,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.6,
  },
  title: {
    fontFamily: fonts.sansSemibold,
    fontSize: 21,
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  titleSmall: {
    fontFamily: fonts.sansSemibold,
    fontSize: 17,
    lineHeight: 24,
    letterSpacing: -0.1,
  },
  /**
   * Body copy at 17pt rather than 16pt. NHS sets its standard paragraph at
   * 19px and this app is read by people who are unwell; a step up costs a
   * line of wrapping and buys legibility.
   */
  body: { fontFamily: fonts.sans, fontSize: 17, lineHeight: 26 },
  bodyStrong: { fontFamily: fonts.sansSemibold, fontSize: 17, lineHeight: 26 },
  /**
   * Text the *user* wrote, or that a source published, shown back to them.
   * Set in the serif on purpose — see the note on `fonts` — and given more
   * leading than the sans, because a serif at this size needs the air.
   */
  bodyQuoted: { fontFamily: fonts.serif, fontSize: 19, lineHeight: 31 },
  caption: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 21 },
  captionStrong: { fontFamily: fonts.sansSemibold, fontSize: 14, lineHeight: 21 },
  /**
   * A short value read at a glance — a dose, a time, a blood type.
   * Semibold, tracked, and tabular so a column of them scans cleanly.
   */
  data: {
    fontFamily: fonts.sansSemibold,
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: 0.2,
    ...TABULAR,
  },
  /** A time or a count set large enough to be the thing you look at. */
  dataLarge: {
    fontFamily: fonts.sansBold,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.2,
    ...TABULAR,
  },
  /**
   * Section label. Letter-spaced rather than shrunk — it stays at 13px so it
   * is still legible, since small type is the first thing to fail for anyone
   * with low vision.
   *
   * ⛔ The 13px floor is an accessibility decision and outranks any mockup;
   * a previous visual direction drew these at 11px and was not adopted.
   *
   * **Sentence case, not upper.** Uppercasing a label costs legibility — the
   * word loses its outline shape, which is most of what makes it readable at
   * a glance — and buys only the look of a label. The tracking and the weight
   * already do that job.
   */
  overline: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.6,
  },
} as const;

/**
 * Depth presets.
 *
 * ## Deliberately almost flat
 *
 * Structure is carried by hairlines, by the colour-coded meter and by the
 * prominence ladder — not by shadow. `sm`, which every resting card uses, is
 * flat; `md` and `lg` are a whisper rather than a lift, kept because depth is
 * still the right vocabulary for a floating bar or a pressed button.
 *
 * Shadows are tinted with the deep ink rather than pure black: a
 * neutral-black shadow over a cool porcelain ground reads as smudge.
 *
 * Depth is decoration only. Nothing in this app uses a shadow to signal
 * urgency, state, or hierarchy that isn't also carried by text.
 */
export const elevation = {
  /** Explicitly flat — cancels a preset inherited from a base style. */
  none: {
    shadowColor: "transparent",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  /** Resting cards and inputs — flat, separated by their border instead. */
  sm: {
    shadowColor: "transparent",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  /** Raised: primary buttons, hovered cards. */
  md: {
    shadowColor: "#0D1B24",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  /** Floating: hero panels and sticky bars. */
  lg: {
    shadowColor: "#0D1B24",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 3,
  },
} as const;

/**
 * ## The meter
 *
 * The one bold device in this design, and the reason it earns its place is
 * that it does three jobs with one mark.
 *
 * It is a measured vertical rule down the leading edge of a screen, drawn in
 * that screen's `domains` colour:
 *
 * - **Identity.** It is the app's memorable element.
 * - **Orientation.** Its colour answers "which part of MedHelp am I in"
 *   before a word has been read — the same job hospital wayfinding gives to a
 *   coloured line on a corridor floor.
 * - **Information.** On the Today screen it is an actual axis: the waking day
 *   with a stop at each reminder time the person set and a marker at the
 *   current moment.
 *
 * ⛔ **It is never the only carrier of anything.** Colour-blind readers,
 * screen-reader users and anyone who has turned contrast up get the same
 * information from the screen title and the row text; the meter is a second,
 * faster route to it and never the first. Nothing may be encoded in it that
 * is not also written down.
 */
/**
 * ## The ground is measured paper
 *
 * Every clinical record is drawn on a ruled grid — ECG strips, growth charts,
 * flowsheets, telemetry. `assets/chart-grid.png` is a 40pt tile of it: a rule
 * every 8pt and a heavier one every 40, baked opaque over `colors.background`
 * so tiling it costs no alpha compositing.
 *
 * It is what makes the meter make sense. A coloured line down the edge of a
 * flat white page is a brand device; the same line on ruled paper is a
 * measurement, which is what this app is actually doing.
 *
 * ⛔ **It stays under the content, never behind text.** Cards, groups and
 * notices are opaque and sit on top, exactly as a label sits on chart paper.
 * Do not raise its contrast: it is at roughly 5% and 10% ink, which is enough
 * to read as texture at arm's length and not enough to interfere with a word.
 * This app is read by people who are unwell.
 */
export const chart = {
  /** Edge of one tile, in points. Also the major rule interval. */
  tile: 40,
  /** Minor rule interval — and the unit the mark is drawn on. */
  unit: 8,
} as const;

export const meter = {
  /** Width of the quiet edge on an ordinary screen. */
  width: 4,
  /** Width of the rule when it is carrying the day's axis on Today. */
  axisWidth: 2,
  /** Diameter of a stop on the axis. */
  stop: 11,
  /** Column the axis and its time labels occupy. */
  axisColumn: 64,
} as const;

/**
 * ## The prominence ladder
 *
 * Every block on every screen sits at one of four levels, and **a screen gets
 * exactly one level-one action**. This is the half of the visual direction
 * that is not about colour at all: without it, a screen's destinations are
 * drawn identically, nothing is primary, and the reader has to read all of
 * them to choose one.
 *
 *   L1  ACT      filled in the screen's domain colour, white text. One per screen.
 *   L2  READ     `surface` with a 1px `border`. Titled blocks and rows.
 *   L3  CONTEXT  `surfaceMuted` fill, no border. Supporting detail.
 *   L4  FINE     no fill; a `border` hairline above it. Footnotes.
 *
 * ⛔ **The emergency palette is exempt.** `EmergencyCallBar`'s "Call 911" and
 * the emergency card's contact call stay filled wherever they appear, however
 * many other filled controls are on screen. The rule exists to stop the app
 * shouting; the one thing it may always shout about is how to get help.
 *
 * These are documentation, not a component — a level is expressed with the
 * tokens above in each component's own stylesheet, because "which level is
 * this" is a judgement per block and a `<Level n={2}>` wrapper would make it
 * look mechanical.
 */
export const PROMINENCE_LEVELS = 4;

/**
 * Minimum interactive size. Apple's HIG asks for 44pt and Android's Material
 * guidance for 48dp; using the larger value satisfies both and helps users
 * with reduced dexterity or a shaking hand.
 */
export const MIN_TAP_TARGET = 48;

/**
 * Content column widths.
 *
 * `form` and `wide` are line-length limits: a text input or a paragraph that
 * runs the full width of a desktop browser is genuinely harder to read, so
 * those two stay narrow however big the window is.
 *
 * `page` is different in kind. It is for a screen that lays *columns* out
 * beside each other rather than stretching one column — the Today screen does
 * this above `BREAKPOINT.expanded`. Nothing inside it exceeds the line-length
 * limits above; there are simply two or three of them side by side.
 */
export const CONTENT_WIDTH = { form: 480, wide: 660, page: 1180 } as const;

/**
 * Viewport widths where the layout changes shape.
 *
 * These are window widths, not device classes: the same browser window
 * crossing 760px gets the two-column layout whether it is a tablet or a
 * desktop, and a phone never does. Screens read them through
 * `useBreakpoint()`.
 *
 * `medium` is deliberately above the widest common phone in landscape (a
 * 430pt phone is 932 long-edge, but the app is portrait-locked on native, so
 * this only ever fires in a browser or on a tablet). Below it, every screen
 * keeps the single stacked column it has always had.
 */
export const BREAKPOINT = { medium: 760, expanded: 1040 } as const;
