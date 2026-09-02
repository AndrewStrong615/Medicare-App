import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { EmergencyCallBar } from "@/components/EmergencyCallBar";
import { ErrorNotice } from "@/components/ErrorNotice";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { IntakeError, submitIntake } from "@/services/intakeService";
import { colors, elevation, radius, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "IntakeFollowUp">;

/**
 * Asks for more detail when the description was not understood.
 *
 * WHY THIS SCREEN EXISTS: "I've been feeling off" matched no rule and no
 * health topic, so it produced a default tier and an empty page. Asking is
 * what any intake process does before answering.
 *
 * The questions come from the server (`app/core/followup.py`) rather than
 * being written here, so there is one reviewable list rather than a copy on
 * each client. They are neutral elicitation — where, how long, what else —
 * and never clinical screening.
 *
 * Two things hold on this screen:
 *
 * 1. `EmergencyCallBar` is present and unconditional. Answering is required
 *    to get a tier, but nothing is required to call 911, and the intro copy
 *    says so.
 * 2. A red-flag description never reaches here at all — the server returns
 *    its emergency guidance immediately instead of asking anything.
 */
export function IntakeFollowUpScreen({ navigation, route }: Props) {
  const { followUp, description, consent, priorAnswers } = route.params;

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showMissing, setShowMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const answerFor = (id: string) => answers[id] ?? "";
  const setAnswer = (id: string, value: string) =>
    setAnswers((current) => ({ ...current, [id]: value }));

  const missing = followUp.questions
    .filter((question) => !answerFor(question.questionId).trim())
    .map((question) => question.questionId);

  const handleSubmit = async () => {
    if (missing.length > 0) {
      setShowMissing(true);
      return;
    }

    setError(null);
    setSubmitting(true);
    // Every round's answers go up together: the server merges them all into
    // the text it re-screens, and reads which round this is from the ids.
    const allAnswers = { ...(priorAnswers ?? {}), ...answers };
    try {
      const result = await submitIntake(description, consent, allAnswers);
      if (result.status === "needs_detail") {
        // The server decides how many rounds there are and when to stop. The
        // client only refuses to go backwards — a round number that did not
        // advance would mean the same questions again, which is the loop this
        // screen must never put someone in.
        if (result.round > followUp.round) {
          navigation.replace("IntakeFollowUp", {
            followUp: result,
            description,
            consent,
            priorAnswers: allAnswers,
          });
          return;
        }
        setError(
          "We still couldn't make sense of this. Please contact a healthcare professional, and call 911 if this may be an emergency."
        );
        return;
      }
      navigation.replace("IntakeResult", {
        assessment: result,
        // The original description; the server merges the follow-up answers
        // into what it assesses, and this is what the user actually wrote.
        description,
      });
    } catch (caught) {
      setError(
        caught instanceof IntakeError
          ? caught.message
          : "Something went wrong. If you feel unwell, contact a healthcare professional."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      {/* Unconditional: answering is required for a tier, never for help. */}
      <EmergencyCallBar />

      <PageHeader
        icon="symptom"
        // Named by round so a second set does not read as the first set
        // repeating — the complaint that prompted this was that the app kept
        // asking the same four things.
        eyebrow={followUp.round > 1 ? `STEP ${followUp.round} OF 2` : undefined}
        title={followUp.round > 1 ? "Just a couple more" : "A few more details"}
        subtitle={followUp.intro}
      />

      {followUp.questions.map((question) => {
        const value = answerFor(question.questionId);
        const isMissing = showMissing && !value.trim();

        if (question.kind === "choice") {
          return (
            <View key={question.questionId} style={styles.question}>
              <Text style={styles.prompt}>{question.prompt}</Text>
              {question.helper ? <Text style={styles.helper}>{question.helper}</Text> : null}

              <View style={styles.choices}>
                {question.choices.map((choice) => (
                  <AppButton
                    key={choice}
                    label={choice}
                    // The filled variant is what marks the current answer.
                    variant={value === choice ? "primary" : "secondary"}
                    onPress={() => setAnswer(question.questionId, choice)}
                    accessibilityHint={
                      value === choice ? "Currently selected" : "Selects this answer"
                    }
                    style={styles.choice}
                  />
                ))}
              </View>

              {isMissing && (
                <Text style={styles.missing} accessibilityLiveRegion="polite">
                  Please answer this to continue.
                </Text>
              )}
            </View>
          );
        }

        return (
          <View key={question.questionId} style={styles.question}>
            {/*
              The prompt is the field's own label rather than separate text
              above it, so screen readers announce the question when the field
              takes focus instead of leaving it stranded.
            */}
            <TextField
              label={question.prompt}
              value={value}
              onChangeText={(text) => setAnswer(question.questionId, text)}
              hint={question.helper}
              error={isMissing ? "Please answer this to continue." : null}
              multiline
              placeholder="Type your answer"
            />
          </View>
        );
      })}

      {error && <ErrorNotice message={error} />}

      <AppButton
        label={submitting ? "Checking..." : "Continue"}
        onPress={handleSubmit}
        disabled={submitting}
      />

      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>{followUp.disclaimer}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  question: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...elevation.sm,
  },
  prompt: { ...typography.bodyStrong, color: colors.textPrimary },
  helper: { ...typography.caption, color: colors.textSecondary },
  choices: { gap: spacing.xs },
  choice: { alignSelf: "flex-start" },
  missing: { ...typography.caption, color: colors.emergencyText },
  disclaimer: { paddingHorizontal: spacing.xs },
  disclaimerText: { ...typography.caption, color: colors.textSecondary },
});
