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
  const isPrimary = variant === "primary";
  // A button mid-request must not fire again: double-taps would send a second
  // signup/login request.
  const isInactive = disabled || loading;

  const hoverProps: HoverProps = {
    onHoverIn: () => setHovered(true),
    onHoverOut: () => setHovered(false),
  };

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
        hovered && !isInactive && HOVER[variant],
        pressed && !isInactive && PRESSED[variant],
        isInactive && INACTIVE[variant],
        style,
      ]}
    >
      <View style={styles.content}>
        {loading && (
          <ActivityIndicator
            size="small"
            color={isPrimary ? colors.textOnAccent : colors.accent}
            style={styles.spinner}
          />
        )}
        <Text style={[styles.label, LABEL[variant], isInactive && LABEL_INACTIVE[variant]]}>
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
  primaryHover: {
    backgroundColor: colors.accentPressed,
    borderColor: colors.accentPressed,
  },
  primaryPressed: {
    backgroundColor: colors.accentPressed,
    borderColor: colors.accentPressed,
    ...elevation.sm,
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
  outlineHover: {
    backgroundColor: colors.accentSurface,
  },
  outlinePressed: {
    backgroundColor: colors.accentSurface,
    borderColor: colors.accentPressed,
  },
  outlineInactive: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.borderStrong,
  },

  secondary: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
  secondaryHover: {
    backgroundColor: colors.surfaceMuted,
  },
  secondaryPressed: {
    backgroundColor: colors.surfaceMuted,
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
  labelAccent: {
    color: colors.accent,
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

const HOVER = {
  primary: styles.primaryHover,
  outline: styles.outlineHover,
  secondary: styles.secondaryHover,
} as const;

const PRESSED = {
  primary: styles.primaryPressed,
  outline: styles.outlinePressed,
  secondary: styles.secondaryPressed,
} as const;

const INACTIVE = {
  primary: styles.primaryInactive,
  outline: styles.outlineInactive,
  secondary: styles.secondaryInactive,
} as const;

const LABEL = {
  primary: styles.labelPrimary,
  outline: styles.labelAccent,
  secondary: styles.labelAccent,
} as const;

const LABEL_INACTIVE = {
  primary: styles.labelPrimaryInactive,
  outline: styles.labelAccentInactive,
  secondary: styles.labelAccentInactive,
} as const;
