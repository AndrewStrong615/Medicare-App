import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { ErrorNotice } from "@/components/ErrorNotice";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import {
  ApiError,
  getSuggestion,
  listSchedules,
  saveSchedule,
} from "@/services/reminderService";
import { formatTimeOfDay, parseTimeOfDay, sortByTime } from "@/services/reminderTiming";
import { MIN_TAP_TARGET, colors, elevation, radius, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "ReminderEdit">;

/**
 * Choosing the times for one medication's reminders.
 *
 * THE RULE THIS SCREEN EXISTS TO ENFORCE.
 *
 * MedHelp may propose times, and may never set them. The directions line is
 * carried verbatim throughout this app precisely because turning "BID" into
 * two alarms is an interpretation, and a wrong one changes when someone takes
 * a medicine. So:
 *
 * 1. **The suggestion is a draft.** It arrives filled in, and nothing exists
 *    until the user presses save — the same read-then-confirm shape as the
 *    label scanner.
 * 2. **The printed directions are always on screen, unedited**, so the user is
 *    comparing the proposal against the label rather than trusting it.
 * 3. **Every time is editable and removable**, including ones MedHelp
 *    proposed.
 * 4. **A frequency MedHelp cannot read gets no guess.** The reason is shown
 *    plainly and the user adds their own times.
 */
export function ReminderEditScreen({ navigation, route }: Props) {
  const { medicationId, medicationName } = route.params;

  const [times, setTimes] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [frequency, setFrequency] = useState<string | null>(null);
  const [suggestionReason, setSuggestionReason] = useState<string | null>(null);
  const [suggested, setSuggested] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        // What is already saved wins over any suggestion: a user who has
        // already chosen their times must not have them quietly replaced.
        const schedules = await listSchedules();
        if (!active) return;
        const mine = schedules.find((item) => item.medicationId === medicationId);
        const existing = mine ? mine.reminders.map((r) => r.timeOfDay) : [];

        const proposal = await getSuggestion(medicationId);
        if (!active) return;

        setFrequency(proposal.frequency ?? mine?.frequency ?? null);

        if (existing.length > 0) {
          setTimes(sortByTime(existing.map((t) => ({ timeOfDay: t }))).map((t) => t.timeOfDay));
        } else if (proposal.recognised) {
          setTimes(proposal.times);
          setSuggested(true);
        } else {
          setSuggestionReason(proposal.reason);
        }
      } catch (caught) {
        if (!active) return;
        setError(
          caught instanceof ApiError
            ? caught.message
            : "We couldn't load this medication's reminders."
        );
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [medicationId]);

  const addTime = useCallback(() => {
    const text = draft.trim();
    const parsed = parseTimeOfDay(text);
    if (!parsed) {
      // Rejected, never reinterpreted — "8" could be morning or evening, and
      // guessing would set an alarm for the wrong half of the day.
      setDraftError("Enter a time as HH:MM on a 24-hour clock, for example 08:00 or 20:30.");
      return;
    }
    if (times.includes(text)) {
      setDraftError("That time is already on the list.");
      return;
    }
    setDraftError(null);
    setDraft("");
    setSuggested(false);
    setTimes((current) => [...current, text].sort((a, b) => a.localeCompare(b)));
  }, [draft, times]);

  const removeTime = useCallback((time: string) => {
    setSuggested(false);
    setTimes((current) => current.filter((item) => item !== time));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await saveSchedule(medicationId, times);
      // Back to the list, which re-arms the notifications from what is saved.
      navigation.navigate("MedicationReminders", { savedFor: medicationName });
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "We couldn't save those reminder times. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }, [medicationId, medicationName, navigation, times]);

  if (loading) {
    return (
      <Screen>
        <View style={styles.loading} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader icon="clock" title={medicationName} subtitle="Choose the times you want to be reminded. Nothing is set until you save." />

      {/*
        The label's own words, unedited, next to whatever MedHelp proposed.
        This is the check on the suggestion: the user compares the times
        against the directions rather than taking the app's word for it.
      */}
      {frequency && (
        <View style={styles.directions} accessibilityRole="summary">
          <Text style={styles.directionsLabel}>Directions on file</Text>
          <Text style={styles.directionsText}>{frequency}</Text>
        </View>
      )}

      {suggested && (
        <View style={styles.suggestion} accessibilityLiveRegion="polite">
          <Text style={styles.suggestionTitle}>These are suggestions</Text>
          <Text style={styles.suggestionText}>
            MedHelp filled in {times.length}{" "}
            {times.length === 1 ? "time" : "times"} a day from the directions
            above. They are a starting point, not advice — change them to the
            times you actually take it, and check with your pharmacist or
            doctor if you are unsure.
          </Text>
        </View>
      )}

      {suggestionReason && (
        <View style={styles.suggestion} accessibilityLiveRegion="polite">
          <Text style={styles.suggestionTitle}>Set your own times</Text>
          <Text style={styles.suggestionText}>{suggestionReason}</Text>
        </View>
      )}

      {error && <ErrorNotice message={error} />}

      <View style={styles.timesCard}>
        <Text style={styles.fieldLabel}>
          {times.length === 0
            ? "No reminder times yet"
            : `${times.length} ${times.length === 1 ? "reminder" : "reminders"} a day`}
        </Text>

        {times.map((time) => (
          <View key={time} style={styles.timeRow}>
            <Text style={styles.timeText}>{formatTimeOfDay(time)}</Text>
            <Pressable
              onPress={() => removeTime(time)}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${formatTimeOfDay(time)}`}
              style={({ pressed }) => [styles.remove, pressed && styles.removePressed]}
            >
              <Text style={styles.removeText}>Remove</Text>
            </Pressable>
          </View>
        ))}

        <TextField
          label="Add a time"
          value={draft}
          onChangeText={setDraft}
          error={draftError}
          hint="24-hour clock, for example 08:00 or 20:30."
          placeholder="08:00"
          keyboardType="numbers-and-punctuation"
          returnKeyType="done"
          onSubmitEditing={addTime}
          editable={!saving}
        />
        <AppButton
          label="Add this time"
          variant="secondary"
          onPress={addTime}
          disabled={saving}
        />
      </View>

      <AppButton
        label={times.length === 0 ? "Turn reminders off" : "Save reminders"}
        onPress={() => void save()}
        loading={saving}
        disabled={saving}
        accessibilityHint={
          times.length === 0
            ? "Removes every reminder for this medication"
            : "Saves these times and starts reminding you"
        }
      />

      <Text style={styles.footnote}>
        MedHelp does not check or suggest medications or dosages, and reminders
        are not a record of what you have taken. Follow the directions from
        your prescriber or pharmacist.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  directions: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  directionsLabel: { ...typography.caption, fontWeight: "600", color: colors.textPrimary },
  directionsText: { ...typography.body, color: colors.textPrimary },
  suggestion: {
    backgroundColor: colors.noticeSurface,
    borderColor: colors.noticeBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  suggestionTitle: { ...typography.bodyStrong, color: colors.noticeText },
  suggestionText: { ...typography.caption, color: colors.noticeText },
  timesCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...elevation.sm,
  },
  fieldLabel: { ...typography.bodyStrong, color: colors.textPrimary },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    minHeight: MIN_TAP_TARGET,
  },
  timeText: { ...typography.bodyStrong, color: colors.textPrimary },
  remove: {
    minHeight: MIN_TAP_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  removePressed: { opacity: 0.6 },
  removeText: { ...typography.caption, color: colors.accent, fontWeight: "600" },
  loading: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  loadingText: { ...typography.body, color: colors.textSecondary },
  footnote: { ...typography.caption, color: colors.textSecondary },
});
