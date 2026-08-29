import { Linking, Platform, StyleSheet, Text, View } from "react-native";

import { AppButton } from "@/components/AppButton";
import { colors, radius, spacing, typography } from "@/theme";
import type { EmergencyGuidance } from "@/services/symptomService";

/**
 * Emergency guidance, rendered above everything else on a result screen.
 *
 * This is the highest-priority element in the app. It uses the only strongly
 * urgent colour in the palette, is announced immediately by screen readers,
 * and offers a one-tap call so someone in distress does not have to find the
 * dialler themselves.
 */
export function EmergencyBanner({ guidance }: { guidance: EmergencyGuidance }) {
  const isCrisisLine = guidance.category === "self_harm";
  const number = isCrisisLine ? "988" : "911";

  const call = () => {
    // `telprompt` lets iOS users cancel before the call places; Android has no
    // equivalent, so `tel` is used there.
    const scheme = Platform.OS === "ios" ? "telprompt" : "tel";
    Linking.openURL(`${scheme}:${number}`).catch(() => {
      // A device with no dialler (e.g. the web preview) should fail quietly —
      // the number is written in the text above regardless.
    });
  };

  return (
    <View
      style={styles.container}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
    >
      <Text style={styles.headline}>{guidance.headline}</Text>
      <Text style={styles.action}>{guidance.action}</Text>
      <AppButton
        label={`Call ${number}`}
        onPress={call}
        style={styles.callButton}
        accessibilityHint={`Calls ${number} from your phone`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.emergencySurface,
    borderColor: colors.emergencyBorder,
    // A thicker border than any other surface, so urgency survives being seen
    // in bright sunlight or by someone who cannot distinguish the colour.
    borderWidth: 2,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  headline: {
    ...typography.title,
    color: colors.emergencyText,
  },
  action: {
    ...typography.body,
    color: colors.emergencyText,
  },
  callButton: {
    alignSelf: "flex-start",
    backgroundColor: colors.emergencyBorder,
    borderColor: colors.emergencyBorder,
    marginTop: spacing.xs,
  },
});
