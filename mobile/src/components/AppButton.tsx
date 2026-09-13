import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useDomain } from "@/hooks/useDomain";
import { MIN_TAP_TARGET, colors, elevation, radius, spacing, typography } from "@/theme";

/**
 * React Native's built-in `Button` renders as borderless blue text on iOS and
 * as a filled, uppercased button on Android, and it cannot show a disabled or
 * loading state. This component keeps one appearance everywhere and covers all
 * four interaction states (rest, hover on web, pressed, disabled/loading).
 *
 * ## The variants are the prominence ladder
 *
 * See `PROMINENCE_LEVELS` in `theme.ts`.
 *
 * - `primary` (L1) — filled. **One per screen**, with the emergency palette
 *   exempt: "Call 911" and the emergency card's contact call stay filled
 *   however many other filled controls are on screen.
 * - `outline` (L2) — a real control, but not the thing the screen is for.
 * - `secondary` (L3) — borderless text, for an action that sits beside
 *   something else rather than ending a task.
 *
 * ## The colour comes from the screen, not from here
 *
 * A filled button takes the current destination's hue (`useDomain`), so the
 * one action on the medications form is indigo and the one on the care form
 * is violet. That is what keeps five colours feeling like a system: the
 * colour is always answering "where am I", never "how urgent is this".
 */
type Variant = "primary" | "outline" | "secondary";

// react-native-web supports hover callbacks on Pressable; the react-native
// types don't declare them, so they're added here rather than cast away.
type HoverProps = {
  onHoverIn?: () => void;
  onHoverOut?: () => void;
};

interface AppButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  /** Spoken by screen readers after the label, e.g. "Opens the symptom list". */
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

export function AppButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  accessibilityHint,
  style,
}: AppButtonProps) {
  const [hovered, setHovered] = useState(false);
  const domain = useDomain();
  const isPrimary = variant === "primary";
  // A button mid-request must not fire again: double-taps would send a second
  // signup/login request.
  const isInactive = disabled || loading;

  const hoverProps: HoverProps = {
    onHoverIn: () => setHovered(true),
    onHoverOut: () => setHovered(false),
  };

  // Rest, hover and pressed in the destination's own hue. Written out rather
  // than kept in the stylesheet because the value is only known at render.
  const tinted: StyleProp<ViewStyle> = isInactive
    ? null
    : isPrimary
      ? {
          backgroundColor: hovered ? domain.pressed : domain.fill,
          borderColor: hovered ? domain.pressed : domain.fill,
        }
      : variant === "outline"
        ? {
            borderColor: domain.ink,
            backgroundColor: hovered ? domain.surface : colors.surface,
          }
        : hovered
          ? { backgroundColor: domain.surface }
          : null;

  return (
    <Pressable
      {...hoverProps}
      onPress={onPress}
      disabled={isInactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isInactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        SURFACE[variant],
        tinted,
        pressed &&
          !isInactive &&
          (isPrimary
            ? { backgroundColor: domain.pressed, borderColor: domain.pressed, ...elevation.sm }
            : { backgroundColor: domain.surface }),
        isInactive && INACTIVE[variant],
        style,
      ]}
    >
      <View style={styles.content}>
        {loading && (
          <ActivityIndicator
            size="small"
            color={isPrimary ? colors.textOnAccent : domain.ink}
            style={styles.spinner}
          />
        )}
        <Text
          style={[
            styles.label,
            isPrimary ? styles.labelPrimary : { color: domain.ink },
            isInactive && LABEL_INACTIVE[variant],
          ]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TAP_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  spinner: {
    marginRight: spacing.sm,
  },

  primary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    ...elevation.md,
  },
  primaryInactive: {
    backgroundColor: colors.accentDisabled,
    borderColor: colors.accentDisabled,
    // A disabled control should not look like it is floating above the page.
    ...elevation.none,
  },

  outline: {
    backgroundColor: colors.surface,
    borderColor: colors.accent,
  },
  outlineInactive: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.borderStrong,
  },

  secondary: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
  secondaryInactive: {
    backgroundColor: "transparent",
  },

  label: {
    ...typography.bodyStrong,
    textAlign: "center",
  },
  labelPrimary: {
    color: colors.textOnAccent,
  },
  labelPrimaryInactive: {
    color: colors.textOnAccent,
  },
  labelAccentInactive: {
    color: colors.textSecondary,
  },
});

const SURFACE = {
  primary: styles.primary,
  outline: styles.outline,
  secondary: styles.secondary,
} as const;

const INACTIVE = {
  primary: styles.primaryInactive,
  outline: styles.outlineInactive,
  secondary: styles.secondaryInactive,
} as const;

const LABEL_INACTIVE = {
  primary: styles.labelPrimaryInactive,
  outline: styles.labelAccentInactive,
  secondary: styles.labelAccentInactive,
} as const;
