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
  DAYS,
  createGoal,
  draftGoal,
  shortDay,
  type ActivityInput,
  type Day,
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
 * ## Two kinds of row, and the person can always tell them apart
 *
 * The usual row is one MedHelp proposed: an activity it wrote, on days it
 * picked, at a time it chose. Those rows are `generated` and they say so on
 * screen. ⛔ Never render a suggested row without that label — a person must
 * be able to tell which lines are theirs, and editing a row's text clears the
 * label because the line has become theirs.
 *
 * The other row quotes the person. It appears when the planner could not
 * answer and the server fell back to splitting what they wrote; the server
 * checked that each row quotes their text, and `sourcePhrase` is shown
 * beneath it so that is visible rather than taken on trust. Those rows carry
 * no schedule, because a time MedHelp invented would be a quantity the person
 * never wrote — the day chips and the time field start empty and they fill
 * them in.
 *
 * A draft can legitimately be empty — no model configured, an outage, or a
 * refusal. The screen then shows the server's sentence and an empty row to
 * type into. There is never a generated fallback plan.
 *
 * ## ⛔ What this screen must keep saying
 *
 * Since 2026-09-12 MedHelp proposes a plan for **any** goal, a medical one
 * included, and no deterministic check screens what it proposes. The footnote
 * above the save button is what tells the person that what they are looking
 * at was written by software and reviewed by nobody. It is not decoration.
 *
 * Nothing here interprets a goal beyond proposing activities for it. It does
 * not say whether a goal is realistic or advisable, and it never explains
 * what an activity will do for the person — a benefit claim is the app making
 * a health claim, which is the line this feature is still built around.
 */
export function GoalCreateScreen({ navigation }: Props) {
  const [description, setDescription] = useState("");
  const [title, setTitle] = useState("");
  const [activities, setActivities] = useState<ActivityInput[]>([]);
  const [sources, setSources] = useState<(string | null)[]>([]);
  // Which rows MedHelp proposed rather than read out of the person's text.
  const [suggested, setSuggested] = useState<boolean[]>([]);
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
    days: [],
    timeOfDay: null,
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
              days: activity.days,
              timeOfDay: activity.timeOfDay,
            }))
          : [blank()]
      );
      setSources(
        draft.activities.length > 0
          ? draft.activities.map((activity) => activity.sourcePhrase)
          : [null]
      );
      setSuggested(
        draft.activities.length > 0
          ? draft.activities.map((activity) => activity.generated)
          : [false]
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
      setSuggested([false]);
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
    // Edited by hand, so it is the person's line now and stops being labelled.
    setSuggested((current) => current.map((was, at) => (at === index ? false : was)));
  };

  /**
   * Add or remove one day from a row's schedule.
   *
   * Rebuilt from `DAYS` rather than pushed onto, so the list stays in week
   * order however the chips were tapped and a schedule reads the same way
   * every time.
   */
  const toggleDay = (index: number, day: Day) => {
    setActivities((current) =>
      current.map((activity, at) => {
        if (at !== index) return activity;
        const picked = new Set(activity.days);
        if (picked.has(day)) picked.delete(day);
        else picked.add(day);
        return { ...activity, days: DAYS.filter((each) => picked.has(each)) };
      })
    );
  };

  const updateTime = (index: number, timeOfDay: string) => {
    setActivities((current) =>
      current.map((activity, at) =>
        at === index ? { ...activity, timeOfDay: timeOfDay.trim() || null } : activity
      )
    );
  };

  const removeActivity = (index: number) => {
    setActivities((current) => current.filter((_, at) => at !== index));
    setSources((current) => current.filter((_, at) => at !== index));
    setSuggested((current) => current.filter((_, at) => at !== index));
  };

  const addActivity = () => {
    setActivities((current) => [...current, blank()]);
    setSources((current) => [...current, null]);
    setSuggested((current) => [...current, false]);
  };

  const filled = activities.filter((activity) => activity.text.trim().length > 0);

  /**
   * A time is either a 24-hour HH:MM or nothing at all.
   *
   * Checked here as well as on the server so someone who mistypes one is told
   * on the screen they typed it on, rather than by a 422 after pressing save.
   */
  const badTimes = filled
    .map((activity, index) => ({ activity, index }))
    .filter(({ activity }) => activity.timeOfDay && !/^([01]\d|2[0-3]):[0-5]\d$/.test(activity.timeOfDay));

  const canSave = title.trim().length > 0 && filled.length > 0 && badTimes.length === 0 && !saving;

  /**
   * Keep the cadence in step with the days that were ticked.
   *
   * The server derives these for a plan it proposed; a row the person typed
   * or re-ticked has to have them worked out somewhere too, or the schedule
   * line would say "whenever you choose" beside three ticked days.
   */
  const withDerivedCadence = (activity: ActivityInput): ActivityInput => {
    if (activity.days.length === 0) return activity;
    if (activity.days.length === DAYS.length) {
      return { ...activity, cadence: "daily", timesPerWeek: null };
    }
    return {
      ...activity,
      cadence: "times_per_week",
      timesPerWeek: activity.days.length,
    };
  };

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      await createGoal({
        title: title.trim(),
        description: description.trim() || title.trim(),
        activities: filled.map((activity) =>
          withDerivedCadence({ ...activity, text: activity.text.trim() })
        ),
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
        subtitle="Write what you want to work towards. MedHelp will suggest a plan and a weekly schedule you can change."
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
        label="What would you like to work towards?"
        value={description}
        onChangeText={setDescription}
        multiline
        placeholder="For example: I want to sleep better and get outdoors more"
        hint="Write it however you like. MedHelp will suggest a few everyday activities and the days and times to do them. Every row is yours to change, and nothing is saved until you press save."
      />

      <AppButton
        label={drafting ? "Working it out…" : "Suggest a plan"}
        onPress={suggest}
        loading={drafting}
        disabled={description.trim().length === 0 || drafting}
        variant="secondary"
        accessibilityHint="Suggests activities and a weekly schedule you can edit. Nothing is saved yet."
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
              {sources[index] ? (
                <Text style={styles.source}>From your words: “{sources[index]}”</Text>
              ) : suggested[index] ? (
                <Text style={styles.suggested}>
                  Suggested by MedHelp — edit it or remove it
                </Text>
              ) : null}

              {/*
                The daily schedule. Every day is a separate toggle rather than
                a "weekdays" shortcut: a shortcut would be MedHelp deciding
                which days someone's week is made of.
              */}
              <Text style={styles.scheduleLabel}>Which days?</Text>
              <View style={styles.days}>
                {DAYS.map((day) => {
                  const picked = activity.days.includes(day);
                  return (
                    <Pressable
                      key={day}
                      onPress={() => toggleDay(index, day)}
                      style={[styles.day, picked && styles.dayPicked]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: picked }}
                      accessibilityLabel={`${day} for activity ${index + 1}`}
                    >
                      <Text style={[styles.dayText, picked && styles.dayTextPicked]}>
                        {shortDay(day)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <TextField
                label="At what time?"
                value={activity.timeOfDay ?? ""}
                onChangeText={(time) => updateTime(index, time)}
                placeholder="08:00"
                hint="24-hour clock, like 08:00 or 18:30. Leave it blank for no set time."
              />
              {activity.timeOfDay &&
                !/^([01]\d|2[0-3]):[0-5]\d$/.test(activity.timeOfDay) && (
                  <Text style={styles.badTime}>
                    Enter the time as HH:MM on a 24-hour clock, like 08:00.
                  </Text>
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
          {/*
            ⛔ This replaced "MedHelp does not decide what your goals should
            be", which stopped being true on 2026-09-12 when the app started
            proposing plans for any goal. A statement about the software that
            no longer describes the software is worse than none, and this one
            sits where a person reads it before saving an authored plan.

            It is not the reviewed `DisclaimerBanner`, which this screen has
            never carried — which screens show that is fenced in CLAUDE.md and
            is a reviewer's call, not a layout one.
          */}
          <Text style={styles.footnote}>
            These suggestions were written by MedHelp, not by a doctor or nurse.
            Nobody medically qualified has checked them or knows anything about
            your health. Change anything that does not suit you, and speak to a
            healthcare professional before acting on a goal about a medical
            condition, a medicine, or a big change to what you eat or how you
            exercise.
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
  suggested: { ...typography.caption, color: colors.accent },
  scheduleLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  days: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  day: {
    minWidth: MIN_TAP_TARGET,
    minHeight: MIN_TAP_TARGET,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  dayPicked: { backgroundColor: colors.accent, borderColor: colors.accent },
  dayText: { ...typography.caption, color: colors.textSecondary },
  dayTextPicked: { color: colors.surface },
  badTime: { ...typography.caption, color: colors.errorText },
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
