/**
 * Design tokens for MedHelp.
 *
 * This is a health app that people may open while worried or in a hurry, so
 * the palette is deliberately low-saturation and the type scale is a little
 * larger than a typical consumer app. Colour is never the only carrier of
 * meaning — errors and emergencies also change wording and iconography.
 *
 * All text/background pairings below meet WCAG AA (4.5:1) at minimum; the
 * ratio is noted where it is close enough to be worth protecting during
 * future palette changes.
 *
 * ## The 2026 "paper" pass
 *
 * The ground moved from a cool blue-grey to a warm paper, the type moved to
 * Literata (a screen reading serif) over Public Sans, and depth moved from
 * drop shadows to hairline rules. The reasoning is specific to this app
 * rather than fashionable: every claim MedHelp makes is hedged — it did not
 * author the symptom text, did not check the emergency card, cannot confirm
 * when an appointment is. A document reads as something written down and
 * attributable. A card floating on a drop shadow reads as a product
 * asserting something.
 *
 * ⛔ **The notice, error, success and emergency families are byte-for-byte
 * what a reviewer signed off on** and were not touched by this pass, because
 * those carry safety meaning. Only the neutrals, the type and the depth
 * changed. Anyone revisiting the palette should keep that line.
 */

export const colors = {
  // Surfaces — warm paper rather than cool grey
  background: "#F6F2EA",
  surface: "#FFFDF9",
  surfaceMuted: "#EFEADF",
  /** Page ground behind a hero panel — one step darker than `background`. */
  surfaceSunken: "#E9E2D4",

  // Text — on `background` unless noted
  textPrimary: "#23201C", // 14.6:1
  textSecondary: "#554E44", // 7.4:1
  /** Quietest readable ink — section labels and footnotes. 5.3:1. */
  textMuted: "#6B6254",
  textOnAccent: "#FFFFFF",
  /** Secondary text on `accentDeep` — 6.6:1. */
  textOnAccentMuted: "#A9CBD8",

  // Lines. These do more work than they used to: with depth removed, a
  // hairline is what separates one block from the next.
  border: "#DED5C6",
  borderStrong: "#C9BEAB",
  borderFocus: "#10657F",
  /** Hairline between rows inside one card. */
  divider: "#EDE6DA",

  // Primary action — a calm clinical blue rather than an urgent one.
  // Unchanged by the paper pass: it still reads correctly on a warm ground
  // and it is the value every contrast note below was measured against.
  accent: "#10657F", // white on this: 6.0:1; on `background`: 6.0:1
  accentPressed: "#0C4E62",
  accentDisabled: "#A9C2CD",
  /** Header/hero ground. White on this: 11.3:1. */
  accentDeep: "#0A3F51",
  /** Tinted fill for icon tiles and quiet accent chips. accent on it: 5.7:1. */
  accentSurface: "#E8F1F5",
  accentBorder: "#BBD5DF",

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
 * The two faces, by their loaded family names.
 *
 * ⛔ **Set `fontFamily`, never `fontWeight`.** These are separate font files
 * per weight, and asking Android for a bold weight of a face that is already
 * bold gets you a synthetically smeared double-bold. The same goes for
 * `fontStyle: "italic"` — use `serifItalic` instead of asking the renderer to
 * slant an upright face.
 *
 * The pairing is not arbitrary. Public Sans is the US Web Design System's
 * face, drawn for exactly this job — government benefits and health
 * interfaces, a large x-height so it survives at label sizes. Literata is a
 * reading serif designed for screens, and it is used here only for text a
 * *person wrote or a source published*: what the user typed into the symptom
 * field, the values on their emergency card, a destination's name. That split
 * is the whole idea — the serif is the app quoting, the sans is the app
 * speaking.
 *
 * Loaded once in `App.tsx`. Nothing renders until they are ready, because
 * swapping a serif in after first paint reflows every screen.
 */
export const fonts = {
  serif: "Literata_400Regular",
  serifItalic: "Literata_400Regular_Italic",
  serifSemibold: "Literata_600SemiBold",
  serifBold: "Literata_700Bold",
  sans: "PublicSans_400Regular",
  sansMedium: "PublicSans_500Medium",
  sansSemibold: "PublicSans_600SemiBold",
  sansBold: "PublicSans_700Bold",
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

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const typography = {
  displayLarge: { fontFamily: fonts.serifBold, fontSize: 34, lineHeight: 41 },
  display: { fontFamily: fonts.serifBold, fontSize: 30, lineHeight: 37 },
  title: { fontFamily: fonts.serifSemibold, fontSize: 21, lineHeight: 28 },
  titleSmall: { fontFamily: fonts.sansSemibold, fontSize: 17, lineHeight: 24 },
  /**
   * Body copy at 17pt rather than 16pt. NHS sets its standard paragraph at
   * 19px and this app is read by people who are unwell; a step up costs a
   * line of wrapping and buys legibility.
   */
  body: { fontFamily: fonts.sans, fontSize: 17, lineHeight: 26 },
  bodyStrong: { fontFamily: fonts.sansSemibold, fontSize: 17, lineHeight: 26 },
  /**
   * Text the *user* wrote, or that a source published, shown back to them.
   * Set in the serif on purpose — see the note on `fonts`.
   */
  bodyQuoted: { fontFamily: fonts.serif, fontSize: 19, lineHeight: 29 },
  caption: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 21 },
  captionStrong: { fontFamily: fonts.sansSemibold, fontSize: 14, lineHeight: 21 },
  /**
   * A short value read at a glance — a dose, a time, a blood type.
   * Semibold and slightly tracked so a column of them scans cleanly.
   */
  data: {
    fontFamily: fonts.sansSemibold,
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: 0.2,
  },
  /**
   * Section eyebrow. Letter-spaced rather than shrunk — it stays at 13px so
   * it is still legible, since small uppercase type is the first thing to
   * fail for anyone with low vision.
   *
   * ⛔ The visual direction this pass came from drew these at 11px. That was
   * not adopted: the 13px floor is an accessibility decision and outranks a
   * mockup.
   */
  overline: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.9,
  },
} as const;

/**
 * Depth presets.
 *
 * ## Deliberately almost flat
 *
 * The paper pass replaced drop shadows with hairline rules, so `sm` — which
 * every resting card used — is now flat, and `md`/`lg` are a whisper rather
 * than a lift. The keys are kept because depth is still the right vocabulary
 * for a floating bar or a pressed button, and because zeroing the values in
 * one place is how the change stays reversible.
 *
 * Shadows are tinted with the text colour rather than pure black: a
 * neutral-black shadow over a warm paper background reads as dirt.
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
    shadowColor: "#3C372F",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  /** Floating: hero panels and sticky bars. */
  lg: {
    shadowColor: "#3C372F",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.09,
    shadowRadius: 12,
    elevation: 3,
  },
} as const;

/**
 * ## The prominence ladder
 *
 * Every block on every screen sits at one of four levels, and **a screen gets
 * exactly one level-one action**. This is the half of the visual direction
 * that is not about colour at all: before it, the home screen's four
 * destination cards were visually identical, so nothing was primary and the
 * reader had to read all four to choose.
 *
 *   L1  ACT      filled `accent`, white text. One per screen.
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
 * beside each other rather than stretching one column — the home screen does
 * this above `BREAKPOINT.expanded`. Nothing inside it exceeds the line-length
 * limits above; there are simply two or three of them side by side.
 */
export const CONTENT_WIDTH = { form: 480, wide: 660, page: 1140 } as const;

/**
 * Viewport widths where the layout changes shape.
 *
 * These are window widths, not device classes: the same browser window
 * crossing 900px gets the two-column home screen whether it is a tablet or a
 * desktop, and a phone never does. Screens read them through
 * `useBreakpoint()`.
 *
 * `medium` is deliberately above the widest common phone in landscape (a
 * 430pt phone is 932 long-edge, but the app is portrait-locked on native, so
 * this only ever fires in a browser or on a tablet). Below it, every screen
 * keeps the single stacked column it has always had.
 */
export const BREAKPOINT = { medium: 760, expanded: 1040 } as const;
