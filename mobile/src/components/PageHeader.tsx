import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { GlyphTile, type GlyphName } from "@/components/Glyph";
import { colors, spacing, typography } from "@/theme";

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
 */
interface PageHeaderProps {
  title: string;
  /** A ReactNode so a screen can keep inline emphasis in its own copy. */
  subtitle?: ReactNode;
  /** Small caps line above the title, e.g. a step count. */
  eyebrow?: string;
  icon?: GlyphName;
}

export function PageHeader({ title, subtitle, eyebrow, icon }: PageHeaderProps) {
  return (
    <View style={styles.container}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <View style={styles.titleRow}>
        {icon ? <GlyphTile name={icon} size={44} /> : null}
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
    color: colors.accent,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
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
  },
});
