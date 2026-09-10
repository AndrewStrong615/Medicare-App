import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Glyph, GlyphTile, type GlyphName } from "@/components/Glyph";
import { MIN_TAP_TARGET, colors, elevation, radius, spacing, typography } from "@/theme";

/**
 * A destination the user can press.
 *
 * The generous hit area is deliberate: this app is used one-handed, sometimes
 * by people who are unwell, and a card is far easier to hit accurately than a
 * row of small text links.
 *
 * The glyph and the chevron are decoration and affordance respectively —
 * neither carries information the title and description do not already state,
 * so the card reads the same to a screen reader as it does on screen.
 *
 * ## The three variants are the prominence ladder
 *
 * See `PROMINENCE_LEVELS` in `theme.ts`. Before this, every destination on
 * the home screen was drawn identically, which meant nothing was primary and
 * a reader had to read all four to choose one.
 *
 * - `primary` (L1) — filled accent. **One per screen.**
 * - `card` (L2) — surface with a hairline border. A standalone destination.
 * - `row` (L2) — the same thing with no edges of its own, for use inside a
 *   `NavGroup`, which draws one border around the set and rules between them.
 */
type NavCardVariant = "primary" | "card" | "row";

interface NavCardProps {
  title: string;
  description: string;
  onPress: () => void;
  icon?: GlyphName;
  variant?: NavCardVariant;
  /** Small caps line above the title. Only meaningful on `primary`. */
  eyebrow?: string;
}

type HoverProps = { onHoverIn?: () => void; onHoverOut?: () => void };

export function NavCard({
  title,
  description,
  onPress,
  icon,
  variant = "card",
  eyebrow,
}: NavCardProps) {
  const [hovered, setHovered] = useState(false);
  const isPrimary = variant === "primary";

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
        styles.base,
        variant === "card" && styles.card,
        variant === "row" && styles.row,
        isPrimary && styles.primary,
        hovered && !isPrimary && styles.hovered,
        hovered && isPrimary && styles.primaryHovered,
        pressed && !isPrimary && styles.pressed,
        pressed && isPrimary && styles.primaryPressed,
      ]}
    >
      {icon &&
        (isPrimary ? (
          // No tile behind it: a tinted square on a filled ground is a third
          // colour doing nothing the fill does not already do.
          <Glyph name={icon} size={28} color={colors.textOnAccent} />
        ) : (
          <GlyphTile
            name={icon}
            tint={hovered ? colors.accent : colors.accentSurface}
            color={hovered ? colors.textOnAccent : colors.accent}
          />
        ))}

      <View style={styles.body}>
        {isPrimary && eyebrow ? (
          <Text style={styles.eyebrow}>{eyebrow}</Text>
        ) : null}
        <Text style={[styles.title, isPrimary && styles.titleOnAccent]}>{title}</Text>
        <Text style={[styles.description, isPrimary && styles.descriptionOnAccent]}>
          {description}
        </Text>
      </View>

      <View style={styles.chevron}>
        <Glyph
          name="chevron"
          size={isPrimary ? 18 : 16}
          color={isPrimary ? colors.textOnAccent : colors.borderStrong}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TAP_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    ...elevation.sm,
  },
  row: {
    // Deliberately edgeless. `NavGroup` owns the border and the rules; a row
    // that drew its own would double every line in the group.
    backgroundColor: "transparent",
  },
  primary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.xl,
    ...elevation.md,
  },
  hovered: {
    backgroundColor: colors.accentSurface,
  },
  pressed: {
    backgroundColor: colors.accentSurface,
  },
  primaryHovered: {
    backgroundColor: colors.accentPressed,
    borderColor: colors.accentPressed,
  },
  primaryPressed: {
    backgroundColor: colors.accentPressed,
    borderColor: colors.accentPressed,
    ...elevation.sm,
  },
  body: {
    flex: 1,
    gap: spacing.xs,
  },
  eyebrow: {
    ...typography.overline,
    color: colors.textOnAccent,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  titleOnAccent: {
    color: colors.textOnAccent,
  },
  description: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  descriptionOnAccent: {
    // White rather than the muted tint: `textOnAccentMuted` is measured
    // against `accentDeep`, and on `accent` it does not reach AA.
    color: colors.textOnAccent,
  },
  chevron: {
    // Nudged in so the arrow sits on the card's optical edge, not its
    // mathematical one.
    marginRight: -spacing.xs,
  },
});
