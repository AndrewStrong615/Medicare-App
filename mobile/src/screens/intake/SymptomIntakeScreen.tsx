import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { EmergencyCallBar } from "@/components/EmergencyCallBar";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { IntakeError, submitIntake } from "@/services/intakeService";
import { MIN_TAP_TARGET, colors, radius, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "SymptomIntake">;

export function SymptomIntakeScreen({ navigation }: Props) {
  const [description, setDescription] = useState("");
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const speech = useSpeechToText((transcript) => {
    // Appended rather than replacing, so dictation can add to typed text.
    setDescription((current) => (current ? `${current} ${transcript}` : transcript));
  });

  const handleSubmit = async () => {
    if (submitting) return;

    const trimmed = description.trim();
    if (!trimmed) {
      setDescriptionError("Describe what's going on so we can estimate how soon you may need care.");
      return;
    }

    setDescriptionError(null);
    setError(null);
    setIsOffline(false);
    setSubmitting(true);

    try {
      const assessment = await submitIntake(trimmed, consent);
      navigation.navigate("IntakeResult", { assessment });
    } catch (caught) {
      if (caught instanceof IntakeError) {
        setError(caught.message);
        setIsOffline(caught.isNetworkError);
      } else {
        setError(
          "We couldn't assess this. Please contact a healthcare professional if you feel unwell, and call 911 if this may be an emergency."
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      {/* Reachable before, during, and after assessment — never conditional. */}
      <EmergencyCallBar />

      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          What's going on?
        </Text>
        <Text style={styles.subtitle}>
          Describe how you're feeling in your own words. Include when it
          started and anything that's changed.
        </Text>
      </View>

      {/*
        Shown before the user submits anything, not after. Required by the
        feature's safety rules — do not move this below the input or hide it
        behind a tap.
      */}
      <View style={styles.disclaimer} accessible accessibilityRole="summary">
        <Text style={styles.disclaimerHeading}>This estimates urgency. It does not diagnose.</Text>
        <Text style={styles.disclaimerBody}>
          MedHelp can suggest how soon you may need to be seen. It cannot tell
          you what is wrong, and it is not a substitute for a clinician. If you
          are in doubt, seek care directly — you never need this app's
          agreement to do that.
        </Text>
      </View>

      {error && (
        <ErrorNotice message={error} onRetry={isOffline ? handleSubmit : undefined} />
      )}

      <TextField
        label="Describe your symptoms"
        placeholder="e.g. I've had a headache for two days and light hurts my eyes"
        value={description}
        onChangeText={setDescription}
        error={descriptionError}
        multiline
        autoCapitalize="sentences"
        editable={!submitting}
      />

      <View style={styles.dictationRow}>
        <AppButton
          label={speech.listening ? "Stop dictating" : "Dictate instead"}
          variant="secondary"
          onPress={speech.listening ? speech.stop : speech.start}
          disabled={submitting}
          accessibilityHint="Uses your device's speech recognition to fill in the description"
        />
        {!speech.supported && (
          <Text style={styles.dictationNote}>
            Dictation isn't available on this device yet — typing works fine.
          </Text>
        )}
        {speech.error && <Text style={styles.dictationError}>{speech.error}</Text>}
      </View>

      <Pressable
        onPress={() => setConsent((value) => !value)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: consent }}
        accessibilityLabel="Save this description so it can be reviewed for accuracy"
        style={styles.consentRow}
        disabled={submitting}
      >
        <View style={[styles.checkbox, consent && styles.checkboxChecked]}>
          {consent && <Text style={styles.checkboxMark}>✓</Text>}
        </View>
        <Text style={styles.consentText}>
          Save this description and the result so MedHelp can review how
          accurate these estimates are. Optional — the estimate works either
          way.
        </Text>
      </Pressable>

      <AppButton
        label={submitting ? "Checking…" : "Get an urgency estimate"}
        onPress={handleSubmit}
        loading={submitting}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs },
  title: { ...typography.display, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary },
  disclaimer: {
    backgroundColor: colors.noticeSurface,
    borderColor: colors.noticeBorder,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  disclaimerHeading: { ...typography.bodyStrong, color: colors.noticeText },
  disclaimerBody: { ...typography.caption, color: colors.noticeText },
  dictationRow: { gap: spacing.xs },
  dictationNote: { ...typography.caption, color: colors.textSecondary },
  dictationError: { ...typography.caption, color: colors.errorText },
  consentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    minHeight: MIN_TAP_TARGET,
    paddingVertical: spacing.sm,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  checkboxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  checkboxMark: { color: colors.textOnAccent, fontSize: 15, fontWeight: "700" },
  consentText: { ...typography.caption, color: colors.textSecondary, flex: 1 },
});
