import { StyleSheet, Text, View } from "react-native";

import { GlyphTile, type GlyphName } from "@/components/Glyph";
import { colors, radius, spacing, typography } from "@/theme";

/**
 * Placeholder for a screen or list with nothing to show yet.
 *
 * An empty state should explain why it's empty and what happens next, rather
 * than leaving a blank panel that reads as a loading failure. The dashed
 * border says the same thing visually: this is a space waiting to be filled,
 * not a card that failed to load.
 */
interface EmptyStateProps {
  title: string;
  description: string;
  icon?: GlyphName;
}

export function EmptyState({ title, description, icon }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      {icon && <GlyphTile name={icon} size={52} />}
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: radius.lg,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  text: {
    gap: spacing.sm,
    alignItems: "center",
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
    textAlign: "center",
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
});
