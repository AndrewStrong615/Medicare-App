import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Glyph, GlyphTile, type GlyphName } from "@/components/Glyph";
import { MIN_TAP_TARGET, colors, elevation, radius, spacing, typography } from "@/theme";

/**
 * A large destination tile for the home screen.
 *
 * The generous hit area is deliberate: this app is used one-handed, sometimes
 * by people who are unwell, and a card is far easier to hit accurately than a
 * row of small text links.
 *
 * The glyph and the chevron are decoration and affordance respectively —
 * neither carries information the title and description do not already state,
 * so the card reads the same to a screen reader as it does on screen.
 */
interface NavCardProps {
  title: string;
  description: string;
  onPress: () => void;
  icon?: GlyphName;
}

type HoverProps = { onHoverIn?: () => void; onHoverOut?: () => void };

export function NavCard({ title, description, onPress, icon }: NavCardProps) {
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
      {icon && (
        <GlyphTile
          name={icon}
          tint={hovered ? colors.accent : colors.accentSurface}
          color={hovered ? colors.textOnAccent : colors.accent}
        />
      )}
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      <View style={styles.chevron}>
        <Glyph name="chevron" size={16} color={colors.borderStrong} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: MIN_TAP_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...elevation.sm,
  },
  cardHovered: {
    borderColor: colors.accentBorder,
    ...elevation.md,
  },
  cardPressed: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSurface,
    ...elevation.sm,
  },
  body: {
    flex: 1,
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
  chevron: {
    // Nudged in so the arrow sits on the card's optical edge, not its
    // mathematical one.
    marginRight: -spacing.xs,
  },
});
