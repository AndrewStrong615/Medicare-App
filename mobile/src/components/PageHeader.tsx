import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Glyph, type GlyphName } from "@/components/Glyph";
import { useDomain } from "@/hooks/useDomain";
import { colors, radius, spacing, typography } from "@/theme";

/**
 * The title block at the top of a screen.
 *
 * Ten screens had grown their own copy of "a display-size heading, then a
 * secondary line", each with its own style block and its own idea of the
 * spacing. This is that pattern in one place, so a change to the type scale
 * lands everywhere at once.
 *
 * `title` is always the screen's `accessibilityRole="header"`, which is what
 * a screen reader's "next heading" gesture jumps between — so the header
 * stays a real landmark, not just large text.
 *
 * The icon sits in a filled tile in the destination's colour, which makes the
 * top of the screen the place the eye lands and ties the page to the meter
 * down its edge and to the tab it came from.
 */
interface PageHeaderProps {
  title: string;
  /** A ReactNode so a screen can keep inline emphasis in its own copy. */
  subtitle?: ReactNode;
  /**
   * A short line above the title.
   *
   * ⛔ Only for something that is genuinely prior to the title — a step
   * count in a sequence, a record this screen belongs to. It is not a slot
   * for a category name: a label that merely restates the title in smaller
   * type is noise above every heading in the app.
   */
  eyebrow?: string;
  icon?: GlyphName;
}

export function PageHeader({ title, subtitle, eyebrow, icon }: PageHeaderProps) {
  const domain = useDomain();

  return (
    <View style={styles.container}>
      {eyebrow ? (
        <Text style={[styles.eyebrow, { color: domain.ink }]}>{eyebrow}</Text>
      ) : null}
      <View style={styles.titleRow}>
        {icon ? (
          <View style={[styles.tile, { backgroundColor: domain.fill }]}>
            <Glyph name={icon} size={22} color={colors.textOnAccent} />
          </View>
        ) : null}
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {typeof subtitle === "string" ? (
        <Text style={styles.subtitle}>{subtitle}</Text>
      ) : (
        subtitle
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  eyebrow: {
    ...typography.overline,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...typography.display,
    color: colors.textPrimary,
    // Lets a long title wrap beside the glyph instead of pushing it off the
    // edge of a narrow phone.
    flex: 1,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    maxWidth: 62 * 8,
  },
});
