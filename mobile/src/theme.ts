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
 */

export const colors = {
  // Surfaces
  background: "#F7F9FA",
  surface: "#FFFFFF",
  surfaceMuted: "#EEF3F6",

  // Text — on `background` unless noted
  textPrimary: "#14293D", // 13.9:1
  textSecondary: "#4A6072", // 6.4:1
  textOnAccent: "#FFFFFF",

  // Lines
  border: "#D3DCE3",
  borderStrong: "#B4C2CD",
  borderFocus: "#10657F",

  // Primary action — a calm clinical blue rather than an urgent one
  accent: "#10657F", // white on this: 6.0:1
  accentPressed: "#0C4E62",
  accentDisabled: "#A9C2CD",

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
} as const;

export const radius = {
  sm: 8,
  md: 12,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 28, fontWeight: "700", lineHeight: 34 },
  title: { fontSize: 20, fontWeight: "600", lineHeight: 26 },
  body: { fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontSize: 16, fontWeight: "600", lineHeight: 24 },
  caption: { fontSize: 14, lineHeight: 20 },
} as const;

/**
 * Minimum interactive size. Apple's HIG asks for 44pt and Android's Material
 * guidance for 48dp; using the larger value satisfies both and helps users
 * with reduced dexterity or a shaking hand.
 */
export const MIN_TAP_TARGET = 48;
