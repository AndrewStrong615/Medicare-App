import { Linking, Platform, StyleSheet, Text, View } from "react-native";

import { AppButton } from "@/components/AppButton";
import { MIN_TAP_TARGET, colors, radius, spacing, typography } from "@/theme";

/**
 * Always-available route to emergency services.
 *
 * REQUIRED on every screen in the symptom-intake flow, whatever tier was
 * assigned. The classification is a suggestion, and a user who disagrees with
 * a SELF-CARE result must be able to act on their own judgement without
 * navigating anywhere. Do not make this conditional on tier.
 */
export function EmergencyCallBar({ compact = false }: { compact?: boolean }) {
  const call = () => {
    // telprompt lets iOS users cancel before dialling; Android has no
    // equivalent, so tel: is used there.
    const scheme = Platform.OS === "ios" ? "telprompt" : "tel";
    Linking.openURL(`${scheme}:911`).catch(() => {
      // No dialler (e.g. the web preview) — the number is written below.
    });
  };

  return (
    <View style={styles.container} accessibilityRole="toolbar">
      <View style={styles.textWrap}>
        <Text style={styles.label}>
          {compact
            ? "In an emergency, don't wait for this app."
            : "If this feels like an emergency, don't wait for this app."}
        </Text>
        <Text style={styles.sublabel}>
          Call 911, or your local emergency number.
        </Text>
      </View>
      <AppButton
        label="Call 911"
        onPress={call}
        style={styles.button}
        accessibilityHint="Calls emergency services from your phone"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: MIN_TAP_TARGET,
    backgroundColor: colors.emergencySurface,
    borderColor: colors.emergencyBorder,
    borderWidth: 2,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: spacing.sm,
  },
  textWrap: {
    gap: 2,
  },
  label: {
    ...typography.bodyStrong,
    color: colors.emergencyText,
  },
  sublabel: {
    ...typography.caption,
    color: colors.emergencyText,
  },
  button: {
    alignSelf: "flex-start",
    backgroundColor: colors.emergencyBorder,
    borderColor: colors.emergencyBorder,
  },
});
