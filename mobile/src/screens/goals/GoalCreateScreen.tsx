import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { AppNav } from "@/components/AppNav";
import { EmergencyCallBar } from "@/components/EmergencyCallBar";
import { ErrorNotice } from "@/components/ErrorNotice";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { ApiError } from "@/services/apiClient";
import {
  createGoal,
  draftGoal,
  type ActivityInput,
  type EmergencyGuidance,
} from "@/services/goalService";
import { MIN_TAP_TARGET, colors, radius, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "GoalCreate">;

/**
 * Write a goal, then confirm the activities MedHelp read out of it.
 *
 * ## MedHelp proposes. The person decides.
 *
 * "Suggest activities" writes nothing on the server. It returns a draft, the
 * draft lands in these fields, and the person edits it before pressing save —
 * the same read-then-confirm shape as `ReminderEditScreen`, and the same
 * reason: MedHelp must not put words in someone's mouth about their own
 * health.
 *
 * ⛔ The suggestion may only ever contain the person's own words rearranged.
 * The server checks that every proposed activity quotes the text they typed
 * and discards the whole draft otherwise, so an activity nobody asked for
 * cannot reach this screen. `sourcePhrase` is shown beneath each row so the
 * person can see which of their words it came from rather than taking it on
 * trust.
 *
 * A draft can legitimately be empty — no model configured, an outage, or a
 * refusal. The screen then shows the server's sentence and an empty row to
 * type into. There is never a generated fallback plan.
 *
 * ⛔ Nothing here interprets a goal. It does not say whether a goal is
 * realistic, healthy or advisable, and it never explains why an activity might
 * help. That would be app-authored health advice, which CLAUDE.md forbids.
 */
export function GoalCreateScreen({ navigation }: Props) {
  const [description, setDescription] = useState("");
  const [title, setTitle] = useState("");
  const [activities, setActivities] = useState<ActivityInput[]>([]);
  const [sources, setSources] = useState<(string | null)[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [emergency, setEmergency] = useState<EmergencyGuidance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);

  const blank = (): ActivityInput => ({
    text: "",
    cadence: "unspecified",
    timesPerWeek: null,
    quantityText: null,
    preferredTime: "unspecified",
  });

  const suggest = async () => {
    setError(null);
    setDrafting(true);
    try {
      const draft = await draftGoal(description);
      setEmergency(draft.emergency);
      setNotice(draft.notice);
      setTitle(draft.title ?? "");
      setActivities(
        draft.activities.length > 0
          ? draft.activities.map((activity) => ({
              text: activity.text,
              cadence: activity.cadence,
              timesPerWeek: activity.timesPerWeek,
              quantityText: activity.quantityText,
              preferredTime: activity.preferredTime,
            }))
          : [blank()]
      );
      setSources(
        draft.activities.length > 0
          ? draft.activities.map((activity) => activity.sourcePhrase)
          : [null]
      );
    } catch (caught) {
      // An outage is not a reason to block someone writing their own list.
      setNotice(
        caught instanceof ApiError
          ? caught.message
          : "We couldn't read that just now. You can add your activities below."
      );
      setActivities([blank()]);
      setSources([null]);
    } finally {
      setDrafting(false);
    }
  };

  const updateActivity = (index: number, text: string) => {
    setActivities((current) =>
      current.map((activity, at) => (at === index ? { ...activity, text } : activity))
    );
    // Once edited it is the person's line, not a quote of anything.
    setSources((current) => current.map((source, at) => (at === index ? null : source)));
  };

  const removeActivity = (index: number) => {
    setActivities((current) => current.filter((_, at) => at !== index));
    setSources((current) => current.filter((_, at) => at !== index));
  };

  const addActivity = () => {
    setActivities((current) => [...current, blank()]);
    setSources((current) => [...current, null]);
  };

  const filled = activities.filter((activity) => activity.text.trim().length > 0);
  const canSave = title.trim().length > 0 && filled.length > 0 && !saving;

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      await createGoal({
        title: title.trim(),
        description: description.trim() || title.trim(),
        activities: filled.map((activity) => ({
          ...activity,
          text: activity.text.trim(),
        })),
      });
      navigation.navigate("HealthGoals", { savedFor: title.trim() });
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "We couldn't save that goal. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppNav current="Goals" navigation={navigation}>
    <Screen wide>
      <PageHeader
        title="Add a goal"
        subtitle="Write what you plan to do. MedHelp will help you keep track of it."
      />

      {/* Above everything else, and never suppressed by a later failure. */}
      {emergency && (
        <View style={styles.emergency}>
          <Text style={styles.emergencyHeadline}>{emergency.headline}</Text>
          <Text style={styles.emergencyAction}>{emergency.action}</Text>
          <EmergencyCallBar />
        </View>
      )}

      <TextField
        label="What do you plan to do?"
        value={description}
        onChangeText={setDescription}
        multiline
        placeholder="For example: walk in the mornings and swim at the weekend"
        hint="Write it however you like. MedHelp only splits up what you write — it never adds activities of its own."
      />

      <AppButton
        label={drafting ? "Reading…" : "Suggest activities"}
        onPress={suggest}
        loading={drafting}
        disabled={description.trim().length === 0 || drafting}
        variant="secondary"
        accessibilityHint="Splits what you wrote into activities you can edit. Nothing is saved yet."
      />

      {notice && <Text style={styles.notice}>{notice}</Text>}

      {activities.length > 0 && (
        <View style={styles.editor}>
          <TextField
            label="Goal name"
            value={title}
            onChangeText={setTitle}
            placeholder="For example: Getting outdoors more"
          />

          <Text style={styles.sectionLabel}>Activities to track</Text>
          {activities.map((activity, index) => (
            <View key={index} style={styles.activityRow}>
              <TextField
                label={`Activity ${index + 1}`}
                value={activity.text}
                onChangeText={(text) => updateActivity(index, text)}
                placeholder="Something you plan to do"
              />
              {sources[index] && (
                <Text style={styles.source}>From your words: “{sources[index]}”</Text>
              )}
              {activities.length > 1 && (
                <Pressable
                  onPress={() => removeActivity(index)}
                  style={styles.remove}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove activity ${index + 1}`}
                >
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              )}
            </View>
          ))}

          <AppButton label="Add another activity" onPress={addActivity} variant="secondary" />

          {error && <ErrorNotice message={error} />}

          <AppButton
            label={saving ? "Saving…" : "Save goal"}
            onPress={save}
            loading={saving}
            disabled={!canSave}
            accessibilityHint="Saves this goal and its activities"
          />
          <Text style={styles.footnote}>
            MedHelp keeps track of what you tick off. It does not decide what your
            goals should be, and it cannot tell you whether a goal is right for you —
            for that, speak to a healthcare professional.
          </Text>
        </View>
      )}
    </Screen>
    </AppNav>
  );
}

const styles = StyleSheet.create({
  emergency: {
    backgroundColor: colors.emergencySurface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  emergencyHeadline: { ...typography.title, color: colors.emergencyText },
  emergencyAction: { ...typography.body, color: colors.emergencyText },
  notice: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  editor: { marginTop: spacing.lg, gap: spacing.md },
  sectionLabel: { ...typography.titleSmall, color: colors.textPrimary },
  activityRow: { gap: spacing.xs },
  source: { ...typography.caption, color: colors.textSecondary },
  remove: {
    minHeight: MIN_TAP_TARGET,
    justifyContent: "center",
  },
  removeText: { ...typography.body, color: colors.textSecondary },
  footnote: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
});
