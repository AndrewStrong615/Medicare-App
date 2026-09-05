import { StyleSheet, Text, View } from "react-native";

import { Glyph, GlyphTile, type GlyphName } from "@/components/Glyph";
import { colors, elevation, radius, spacing, typography } from "@/theme";

/**
 * A titled card of short factual rows.
 *
 * ⛔ WHAT MAY GO IN ONE. This component fills space on wide screens, and the
 * temptation on a health app's home screen is to fill it with health content —
 * a tip of the day, a condition summary, a number about the user. None of
 * those may go here:
 *
 * - No clinical content. CLAUDE.md forbids an agent authoring symptom,
 *   condition or dosage text at all, and every word the app *does* show from
 *   MedlinePlus is rendered verbatim with attribution, which is not what this
 *   card does.
 * - No numbers about the user's health. MedHelp does not know whether a dose
 *   was taken; a "3 of 4 taken today" tile would invent a clinical fact, and
 *   is the same mistake the home screen's hero comment already warns off.
 *
 * What it is for is statements about the *software*: what the app does, what
 * it deliberately does not do, and where data goes. Those are the things a
 * person arriving at a health app they have never seen actually needs, and
 * they are checkable against the code rather than being medical claims.
 */
export interface InfoPanelItem {
  /** A short leading number or letter, e.g. a step index. */
  step?: string;
  /** Decoration beside the row. Never the only carrier of meaning. */
  icon?: GlyphName;
  title?: string;
  text: string;
}

interface InfoPanelProps {
  title: string;
  items: InfoPanelItem[];
  /** Quieter line under the rows — a caveat or an attribution. */
  footnote?: string;
  /** Muted ground instead of white, to sit a panel back from the cards. */
  tone?: "surface" | "muted";
  /**
   * Marker for a row that carries neither a `step` nor an `icon`. "none"
   * drops the marker column entirely — a tick beside a list of things the app
   * refuses to do reads as approval of the wrong thing.
   */
  bullet?: GlyphName | "none";
}

export function InfoPanel({
  title,
  items,
  footnote,
  tone = "surface",
  bullet = "check",
}: InfoPanelProps) {
  return (
    <View style={[styles.panel, tone === "muted" && styles.panelMuted]}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>

      <View style={styles.items}>
        {items.map((item, index) => (
          <View key={index} style={styles.row}>
            {item.step ? (
              <View style={styles.step}>
                <Text style={styles.stepText}>{item.step}</Text>
              </View>
            ) : item.icon ? (
              <GlyphTile name={item.icon} size={34} />
            ) : bullet === "none" ? null : (
              // A plain bullet still needs to occupy the marker column, or the
              // text in a mixed list would not line up with the rows above it.
              <View style={styles.bullet}>
                <Glyph name={bullet} size={16} color={colors.accent} />
              </View>
            )}

            <View style={styles.rowBody}>
              {item.title ? <Text style={styles.rowTitle}>{item.title}</Text> : null}
              <Text style={styles.rowText}>{item.text}</Text>
            </View>
          </View>
        ))}
      </View>

      {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    // Fills the row height when a CardGrid puts two panels side by side.
    flex: 1,
    ...elevation.sm,
  },
  panelMuted: {
    backgroundColor: colors.surfaceMuted,
    ...elevation.none,
  },
  title: {
    ...typography.overline,
    color: colors.textSecondary,
  },
  items: {
    gap: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  step: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    alignItems: "center",
    justifyContent: "center",
    // Optical alignment with the first line of the row's text.
    marginTop: 1,
  },
  stepText: {
    ...typography.captionStrong,
    color: colors.accent,
  },
  bullet: {
    width: 28,
    alignItems: "center",
    marginTop: 2,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  rowText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  footnote: {
    ...typography.caption,
    color: colors.textSecondary,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: spacing.md,
  },
});
