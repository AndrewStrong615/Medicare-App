import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing, typography } from "@/theme";

/**
 * Confirms an action completed. Used where the result would otherwise be
 * invisible — for example landing back on the sign-in screen after creating
 * an account, where silence leaves people unsure it worked.
 */
export function SuccessNotice({ message }: { message: string }) {
  return (
    <View style={styles.container} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.successSurface,
    borderColor: colors.successBorder,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  message: {
    ...typography.body,
    color: colors.successText,
  },
});
