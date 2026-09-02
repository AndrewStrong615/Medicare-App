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
 * The 2026 visual pass added depth (`elevation`), a tint ramp around the
 * accent, and more steps in the type scale. It changed no existing token
 * value: the notice, error, success and emergency families are byte-for-byte
 * what a reviewer signed off on, because those carry safety meaning.
 */

export const colors = {
  // Surfaces
  background: "#F7F9FA",
  surface: "#FFFFFF",
  surfaceMuted: "#EEF3F6",
  /** Page ground behind a hero panel — one step darker than `background`. */
  surfaceSunken: "#EAEFF3",

  // Text — on `background` unless noted
  textPrimary: "#14293D", // 13.9:1
  textSecondary: "#4A6072", // 6.4:1
  textOnAccent: "#FFFFFF",
  /** Secondary text on `accentDeep` — 6.6:1. */
  textOnAccentMuted: "#A9CBD8",

  // Lines
  border: "#D3DCE3",
  borderStrong: "#B4C2CD",
  borderFocus: "#10657F",
  /** Hairline between rows inside one card. */
  divider: "#E4EAEF",

  // Primary action — a calm clinical blue rather than an urgent one
  accent: "#10657F", // white on this: 6.0:1
  accentPressed: "#0C4E62",
  accentDisabled: "#A9C2CD",
  /** Header/hero ground. White on this: 11.3:1. */
  accentDeep: "#0A3F51",
  /** Tinted fill for icon tiles and quiet accent chips. accent on it: 5.7:1. */
  accentSurface: "#E8F1F5",
  accentBorder: "#BBD5DF",

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
  displayLarge: { fontSize: 32, fontWeight: "700", lineHeight: 38 },
  display: { fontSize: 28, fontWeight: "700", lineHeight: 34 },
  title: { fontSize: 20, fontWeight: "600", lineHeight: 26 },
  titleSmall: { fontSize: 17, fontWeight: "600", lineHeight: 24 },
  body: { fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontSize: 16, fontWeight: "600", lineHeight: 24 },
  caption: { fontSize: 14, lineHeight: 20 },
  captionStrong: { fontSize: 14, fontWeight: "600", lineHeight: 20 },
  /**
   * Section eyebrow. Letter-spaced rather than shrunk — it stays at 13px so
   * it is still legible, since small uppercase type is the first thing to
   * fail for anyone with low vision.
   */
  overline: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    letterSpacing: 0.9,
  },
} as const;

/**
 * Depth presets.
 *
 * Each carries both the iOS/web keys (`shadow*`, which react-native-web turns
 * into a box-shadow) and Android's `elevation`, so one style object covers all
 * three platforms. Shadows are tinted with the text colour rather than pure
 * black: a neutral-black shadow over a cool grey background reads as dirt.
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
  /** Resting cards and inputs. */
  sm: {
    shadowColor: "#14293D",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  /** Raised: primary buttons, hovered cards. */
  md: {
    shadowColor: "#14293D",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  /** Floating: hero panels and sticky bars. */
  lg: {
    shadowColor: "#14293D",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 22,
    elevation: 8,
  },
} as const;

/**
 * Minimum interactive size. Apple's HIG asks for 44pt and Android's Material
 * guidance for 48dp; using the larger value satisfies both and helps users
 * with reduced dexterity or a shaking hand.
 */
export const MIN_TAP_TARGET = 48;

/** Content column. Keeps line length readable on tablets and in the browser. */
export const CONTENT_WIDTH = { form: 480, wide: 620 } as const;
