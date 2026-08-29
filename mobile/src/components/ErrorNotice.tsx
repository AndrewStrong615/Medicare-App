import { StyleSheet, Text, View } from "react-native";

import { AppButton } from "@/components/AppButton";
import { colors, radius, spacing, typography } from "@/theme";

/**
 * A form-level failure message. Errors here should say what happened and what
 * to do next — never "Something went wrong", which leaves an already-anxious
 * person with no next step.
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
      <Text style={styles.message}>{message}</Text>
      {onRetry && (
        <AppButton
          label={retryLabel}
          variant="secondary"
          onPress={onRetry}
          style={styles.retry}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.errorSurface,
    borderColor: colors.errorBorder,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: spacing.xs,
  },
  message: {
    ...typography.body,
    color: colors.errorText,
  },
  retry: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
  },
});
