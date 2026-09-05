import { StyleSheet, Text, View } from "react-native";

import { AppButton } from "@/components/AppButton";
import { Glyph } from "@/components/Glyph";
import { colors, radius, spacing, typography } from "@/theme";

/**
 * A form-level failure message. Errors here should say what happened and what
 * to do next — never "Something went wrong", which leaves an already-anxious
 * person with no next step.
 *
 * The glyph and the left rail are redundant with the colour on purpose: this
 * still reads as a failure in greyscale, in high-contrast mode, and to anyone
 * who cannot distinguish red from the page.
 */
interface ErrorNoticeProps {
  message: string;
  /** Shown only when retrying is actually likely to help (e.g. offline). */
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorNotice({ message, onRetry, retryLabel = "Try again" }: ErrorNoticeProps) {
  return (
    <View
      style={styles.container}
      // Announced by screen readers as soon as it appears, so the failure is
      // not silent for anyone not looking at the field they just left.
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View style={styles.rail} />
      <View style={styles.content}>
        <View style={styles.row}>
          <Glyph name="alert" size={18} color={colors.errorText} />
          <Text style={styles.message}>{message}</Text>
        </View>
        {onRetry && (
          <AppButton
            label={retryLabel}
            variant="secondary"
            onPress={onRetry}
            style={styles.retry}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: colors.errorSurface,
    borderColor: colors.errorBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  rail: {
    width: 4,
    backgroundColor: colors.errorText,
  },
  content: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  message: {
    ...typography.body,
    color: colors.errorText,
    flex: 1,
  },
  retry: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
  },
});
