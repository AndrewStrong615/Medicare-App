import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Glyph, type GlyphName } from "@/components/Glyph";
import { useDomain } from "@/hooks/useDomain";
import {
  MIN_TAP_TARGET,
  colors,
  domains,
  elevation,
  meter,
  radius,
  spacing,
  typography,
  type DomainName,
} from "@/theme";

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
 * See `PROMINENCE_LEVELS` in `theme.ts`. Without it, every destination on a
 * hub screen is drawn identically, which means nothing is primary and a
 * reader has to read all of them to choose one.
 *
 * - `primary` (L1) — filled in the destination's colour. **One per screen.**
 * - `card` (L2) — surface with a hairline border and a colour spine on its
 *   leading edge. A standalone destination.
 * - `row` (L2) — the same thing with no edges of its own, for use inside a
 *   `NavGroup`, which draws one border around the set and rules between them.
 *
 * ## `to` is what makes the spine worth drawing
 *
 * A card's colour is the colour of the place it *goes*, which is why it takes
 * a `to` rather than inheriting the screen it sits on. On a screen where every
 * card leads somewhere different — the Today screen, mainly — the spine tells
 * you which part of the app a press will land you in before you have read the
 * title, and the colour matches the tab that lights up when you get there.
 *
 * Left unset, it falls back to the current screen's domain, which is the right
 * answer for a list of destinations that all live in one place.
 */
type NavCardVariant = "primary" | "card" | "row";

interface NavCardProps {
  title: string;
  description: string;
  onPress: () => void;
  icon?: GlyphName;
  variant?: NavCardVariant;
  /** The destination this leads to — see above. Defaults to this screen's. */
  to?: DomainName;
  /**
   * A short line above the title. Only meaningful on `primary`, and only for
   * something genuinely prior to it — not a restatement of the title.
   */
  eyebrow?: string;
}

type HoverProps = { onHoverIn?: () => void; onHoverOut?: () => void };

export function NavCard({
  title,
  description,
  onPress,
  icon,
  variant = "card",
  to,
  eyebrow,
}: NavCardProps) {
  const [hovered, setHovered] = useState(false);
  const current = useDomain();
  const domain = to ? domains[to] : current;
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
        isPrimary && [
          styles.primary,
          {
            backgroundColor: hovered || pressed ? domain.pressed : domain.fill,
            borderColor: hovered || pressed ? domain.pressed : domain.fill,
          },
          pressed && elevation.sm,
        ],
        !isPrimary && (hovered || pressed) && { backgroundColor: domain.surface },
      ]}
    >
      {/*
        The spine. On `card` it is the card's own leading edge; `row` leaves it
        off, because a group of rows already shares one border and a stack of
        five stripes inside it would be a pattern rather than a signal.
      */}
      {variant === "card" ? (
        <View
          style={[styles.spine, { backgroundColor: domain.fill }]}
          pointerEvents="none"
        />
      ) : null}

      {icon &&
        (isPrimary ? (
          // No tile behind it: a tinted square on a filled ground is a third
          // colour doing nothing the fill does not already do.
          <Glyph name={icon} size={28} color={colors.textOnAccent} />
        ) : (
          <View
            style={[
              styles.tile,
              { backgroundColor: hovered ? domain.fill : domain.surface },
            ]}
          >
            <Glyph
              name={icon}
              size={20}
              color={hovered ? colors.textOnAccent : domain.ink}
            />
          </View>
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
    // Room for the spine, so the icon tile does not sit on top of it.
    paddingLeft: spacing.lg + meter.width,
    overflow: "hidden",
    ...elevation.sm,
  },
  row: {
    // Deliberately edgeless. `NavGroup` owns the border and the rules; a row
    // that drew its own would double every line in the group.
    backgroundColor: "transparent",
  },
  primary: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.xl,
    ...elevation.md,
  },
  spine: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: meter.width,
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
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
    // against `accentDeep`, and on a domain fill it does not reach AA.
    color: colors.textOnAccent,
  },
  chevron: {
    // Nudged in so the arrow sits on the card's optical edge, not its
    // mathematical one.
    marginRight: -spacing.xs,
  },
});
