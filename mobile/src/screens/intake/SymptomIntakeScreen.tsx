import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { EmergencyCallBar } from "@/components/EmergencyCallBar";
import { ErrorNotice } from "@/components/ErrorNotice";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { IntakeError, submitIntake } from "@/services/intakeService";
import { MIN_TAP_TARGET, colors, radius, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "SymptomIntake">;

export function SymptomIntakeScreen({ navigation, route }: Props) {
  const [description, setDescription] = useState("");
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const reset = route.params?.reset;

  /*
    Start "Describe something else" from empty.

    That button navigates BACK to this screen rather than opening a new one —
    it is already in the stack, underneath the result — so the component never
    unmounts and its state survives. Someone describing a second complaint was
    landing on the first one's text and having to clear it by hand.

    CONSENT IS RESET TOO, and that part is not cosmetic. It was ticked for a
    particular description; carrying it silently onto the next one would store
    a second piece of health data under permission given for something else.
    A new description asks again.

    The param is cleared as it is consumed, so returning here later — from the
    follow-up questions, say — does not wipe text the user is still editing.
  */
  useEffect(() => {
    if (!reset) return;

    setDescription("");
    setDescriptionError(null);
    setConsent(false);
    setError(null);
    setIsOffline(false);
    navigation.setParams({ reset: undefined });
  }, [reset, navigation]);

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
      const result = await submitIntake(trimmed, consent);
      if (result.status === "needs_detail") {
        // The server could not make sense of this and is asking rather than
        // guessing. A red-flag description never lands here — it comes back
        // as an assessment with its emergency guidance already attached.
        navigation.navigate("IntakeFollowUp", {
          followUp: result,
          description: trimmed,
          consent,
        });
      } else {
        navigation.navigate("IntakeResult", {
          assessment: result,
          // Carried so the appointment flow can prefill the reason for visit.
          description: trimmed,
        });
      }
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

      <PageHeader
        icon="symptom"
        title="What's going on?"
        subtitle="Describe how you're feeling in your own words. Include when it started and anything that's changed."
      />

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
