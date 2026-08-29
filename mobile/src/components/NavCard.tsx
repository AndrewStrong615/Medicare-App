import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { MIN_TAP_TARGET, colors, radius, spacing, typography } from "@/theme";

/**
 * A large destination tile for the home screen.
 *
 * The generous hit area is deliberate: this app is used one-handed, sometimes
 * by people who are unwell, and a card is far easier to hit accurately than a
 * row of small text links.
 */
interface NavCardProps {
  title: string;
  description: string;
  onPress: () => void;
}

type HoverProps = { onHoverIn?: () => void; onHoverOut?: () => void };

export function NavCard({ title, description, onPress }: NavCardProps) {
  const [hovered, setHovered] = useState(false);

  const hoverProps: HoverProps = {
    onHoverIn: () => setHovered(true),
    onHoverOut: () => setHovered(false),
  };

  return (
    <Pressable
      {...hoverProps}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      // The description is a hint rather than part of the label so the
      // destination name is announced first.
      accessibilityHint={description}
      style={({ pressed }) => [
        styles.card,
        hovered && styles.cardHovered,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: MIN_TAP_TARGET,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  cardHovered: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceMuted,
  },
  cardPressed: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceMuted,
  },
  body: {
    gap: spacing.xs,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  description: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
