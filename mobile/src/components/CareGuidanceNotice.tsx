import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing, typography } from "@/theme";

/**
 * The persistent "when to see a doctor" block required on every result
 * screen. The text comes from the server so that this safety copy has a
 * single reviewable source rather than being restated per screen.
 */
export function CareGuidanceNotice({ guidance }: { guidance: string }) {
  return (
    <View style={styles.container} accessible accessibilityRole="summary">
      {/*
        Not "When to see a doctor": that heading promises condition-specific
        criteria this block deliberately does not give, which risks reading as
        "there is nothing more specific to know".
      */}
      <Text style={styles.heading}>If you're worried about your symptoms</Text>
      <Text style={styles.body}>{guidance}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  heading: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  body: {
    ...typography.caption,
    color: colors.textPrimary,
  },
});
