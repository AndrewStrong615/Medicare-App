import { StyleSheet, Text, View } from "react-native";

import { colors, typography } from "@/theme";

/**
 * MedHelp's mark: one cell of chart paper.
 *
 * ## Why it is not a plus in a rounded square
 *
 * That was the previous mark, and it is the single most generic thing a
 * health product can put in front of someone — a cross in a soft-cornered
 * tile is on a thousand clinics, insurers and pill apps, and it says only
 * "medical", which the word MedHelp beside it already said.
 *
 * This one is built from the same grid the app is drawn on: a hard-cornered
 * square divided into four quadrants by a cross-shaped gutter, the gutter one
 * grid unit wide. It reads two ways at once, which is the whole point — the
 * cross of the gutter is still a health cross, and the four cells are one
 * square of the ruled paper every clinical record is written on.
 *
 * ⛔ **Sharp corners, always.** The radius is what made the old one generic,
 * and a rounded cell is not a cell of anything. Nothing here softens.
 *
 * The gutter is painted rather than punched through, so the mark keeps its
 * shape on any ground — a rail, a coloured band, a dark panel — instead of
 * showing whatever is behind it.
 */
export function Mark({
  size = 28,
  color = colors.accentDeep,
  gutter = colors.surface,
}: {
  size?: number;
  /** The four quadrants. Takes a destination's hue on a coloured surface. */
  color?: string;
  /** The cross between them — set this to whatever the mark sits on. */
  gutter?: string;
}) {
  // One grid unit at this size, rounded to a whole pixel so the cross stays
  // crisp rather than landing on a half-pixel and going grey.
  const rule = Math.max(2, Math.round(size / 9));
  const cell = (size - rule) / 2;

  return (
    <View
      style={[styles.mark, { width: size, height: size, backgroundColor: color }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={{
          position: "absolute",
          left: cell,
          top: 0,
          bottom: 0,
          width: rule,
          backgroundColor: gutter,
        }}
      />
      <View
        style={{
          position: "absolute",
          top: cell,
          left: 0,
          right: 0,
          height: rule,
          backgroundColor: gutter,
        }}
      />
    </View>
  );
}

/** The mark and the name, locked up. */
export function Wordmark({
  size = 28,
  color = colors.accentDeep,
  gutter = colors.surface,
  textColor = colors.textPrimary,
}: {
  size?: number;
  color?: string;
  gutter?: string;
  textColor?: string;
}) {
  return (
    <View style={styles.lockup}>
      <Mark size={size} color={color} gutter={gutter} />
      <Text style={[styles.name, { color: textColor, fontSize: size * 0.72 }]}>
        MedHelp
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    // ⛔ No borderRadius. See the note above.
    overflow: "hidden",
  },
  lockup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  name: {
    ...typography.displayLarge,
    // Overridden by the caller's size; the token supplies family and tracking.
    lineHeight: undefined,
  },
});
