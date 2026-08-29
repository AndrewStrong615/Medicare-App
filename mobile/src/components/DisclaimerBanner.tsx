import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing, typography } from "@/theme";

/**
 * Required on every screen that shows symptom or condition information
 * (see CLAUDE.md "App Scope"). Do not remove or make this dismissible
 * without replacing it with an equally visible disclaimer.
 *
 * It is styled as a calm notice rather than a warning: it must be impossible
 * to miss, but it should not read as an alarm to someone already worried.
 */
export function DisclaimerBanner() {
  return (
    <View
      style={styles.container}
      accessibilityRole="summary"
      // Grouped so screen readers announce the heading and body as one item
      // instead of two disconnected fragments.
      accessible
    >
      <Text style={styles.heading}>Information only</Text>
      <Text style={styles.text}>
        This app provides general information only and is not a substitute for
        professional medical advice, diagnosis, or treatment. Always consult a
        qualified healthcare professional with questions about a medical
        condition.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.noticeSurface,
    borderColor: colors.noticeBorder,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  heading: {
    ...typography.bodyStrong,
    color: colors.noticeText,
  },
  text: {
    // Was 13px on a low-contrast amber; now 14px at 8.4:1, which stays
    // readable for older users and in bright light.
    ...typography.caption,
    color: colors.noticeText,
  },
});
