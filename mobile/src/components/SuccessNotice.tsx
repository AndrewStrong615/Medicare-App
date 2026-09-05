import { StyleSheet, Text, View } from "react-native";

import { Glyph } from "@/components/Glyph";
import { colors, radius, spacing, typography } from "@/theme";

/**
 * Confirms an action completed. Used where the result would otherwise be
 * invisible — for example landing back on the sign-in screen after creating
 * an account, where silence leaves people unsure it worked.
 *
 * As with ErrorNotice, the tick and the left rail carry the meaning alongside
 * the colour rather than relying on it.
 */
export function SuccessNotice({ message }: { message: string }) {
  return (
    <View style={styles.container} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <View style={styles.rail} />
      <View style={styles.row}>
        <Glyph name="check" size={18} color={colors.successText} />
        <Text style={styles.message}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: colors.successSurface,
    borderColor: colors.successBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  rail: {
    width: 4,
    backgroundColor: colors.successText,
  },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
  },
  message: {
    ...typography.body,
    color: colors.successText,
    flex: 1,
  },
});
