import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { AppNav } from "@/components/AppNav";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Glyph } from "@/components/Glyph";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { SuccessNotice } from "@/components/SuccessNotice";
import { ApiError } from "@/services/apiClient";
import {
  dayOfWeek,
  deleteGoal,
  listGoals,
  localDay,
  setCompletion,
  shortDay,
  type GoalActivity,
  type HealthGoal,
} from "@/services/goalService";
import { MIN_TAP_TARGET, colors, elevation, radius, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "HealthGoals">;

/**
 * The person's goals, and today's ticks.
 *
 * ## This is not an adherence record
 *
 * A tick is a note the person made for themselves. An unticked activity means
 * nothing was ticked — not that anything was missed, skipped or failed. The
 * screen never says "missed", never scores a day, and never shows a
 * percentage, for the same reason a passed medication reminder reads "earlier
 * today": MedHelp has no idea what anyone actually did, and implying otherwise
 * invents a clinical fact about them.
 *
 * ⛔ Do not add streaks, adherence figures, or "3 of 4 done" tiles here. That
 * is the same mistake CLAUDE.md warns about for the home screen's panels.
 *
 * ## Nothing on this screen is health advice
 *
 * The activity text is the person's own words. MedHelp does not comment on it,
 * rank it, or explain what it might do for them.
 */
export function HealthGoalsScreen({ navigation, route }: Props) {
  const [goals, setGoals] = useState<HealthGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /*
   * The "has been saved" confirmation, and the one thing that retires it.
   *
   * Seen on the deployed site on 2026-09-12: deleting the goal you had just
   * saved left the screen reading "“Fit and Blood Pressure Support Plan” has
   * been saved." directly above "No goals yet". The banner is driven by a
   * navigation param, so it outlived the thing it was describing.
   *
   * Two contradictory statements about the person's own data, one of which is
   * false. Cheap to get right, and this app's whole posture is not saying
   * things that are not so.
   */
  const [savedFor, setSavedFor] = useState(route.params?.savedFor);

  const today = localDay();

  const load = useCallback(async () => {
    setError(null);
    try {
      setGoals(await listGoals(today));
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "We couldn't load your goals right now."
      );
    } finally {
      setLoading(false);
    }
  }, [today]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const toggle = async (goal: HealthGoal, activity: GoalActivity) => {
    setBusy(activity.id);
    // Optimistic, so a tap feels immediate; the server's answer replaces it.
    setGoals((current) =>
      current.map((one) =>
        one.id !== goal.id
          ? one
          : {
              ...one,
              activities: one.activities.map((each) =>
                each.id === activity.id
                  ? { ...each, completedToday: !each.completedToday }
                  : each
              ),
            }
      )
    );
    try {
      const updated = await setCompletion(
        goal.id,
        activity.id,
        !activity.completedToday,
        today
      );
      setGoals((current) =>
        current.map((one) => (one.id === updated.id ? updated : one))
      );
    } catch {
      // Put it back rather than leaving a tick the server never recorded.
      await load();
    } finally {
      setBusy(null);
    }
  };

  // Which weekday it is where the person is. Read off the device's own
  // calendar rather than through UTC, so a plan that says Tuesday reads as
  // Tuesday wherever they are.
  const weekday = dayOfWeek();

  const remove = async (goal: HealthGoal) => {
    setBusy(goal.id);
    try {
      await deleteGoal(goal.id);
      setGoals((current) => current.filter((one) => one.id !== goal.id));
      // The confirmation described this goal. It no longer exists, so the
      // sentence is no longer true. Only this goal's banner is retired —
      // deleting something else does not silence a confirmation about a goal
      // that is still there.
      setSavedFor((current) => (current === goal.title ? undefined : current));
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "We couldn't delete that goal."
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <AppNav current="Goals" navigation={navigation}>
    <Screen wide>
      <PageHeader
        icon="check"
        title="Goals"
        subtitle="Things you decided to do, and what you've ticked off today."
      />

      {savedFor && <SuccessNotice message={`“${savedFor}” has been saved.`} />}
      {error && <ErrorNotice message={error} onRetry={load} retryLabel="Try again" />}

      {loading ? (
        <ActivityIndicator style={styles.loading} />
      ) : goals.length === 0 ? (
        <View style={styles.empty}>
          <EmptyState
            icon="check"
            title="No goals yet"
            description="Write down something you plan to do and MedHelp will help you keep track of it."
          />
          <AppButton label="Add a goal" onPress={() => navigation.navigate("GoalCreate")} />
        </View>
      ) : (
        <View style={styles.list}>
          {goals.map((goal) => (
            <View key={goal.id} style={styles.card}>
              <Text style={styles.goalTitle} accessibilityRole="header">
                {goal.title}
              </Text>

              {goal.activities.map((activity) => (
                <Pressable
                  key={activity.id}
                  style={styles.activity}
                  onPress={() => toggle(goal, activity)}
                  disabled={busy === activity.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: activity.completedToday }}
                  accessibilityLabel={activity.text}
                  accessibilityHint="Ticks this off for today"
                >
                  <View
                    style={[styles.box, activity.completedToday && styles.boxChecked]}
                  >
                    {activity.completedToday && (
                      <Glyph name="check" size={16} color={colors.surface} />
                    )}
                  </View>
                  <View style={styles.activityText}>
                    <Text style={styles.activityLabel}>{activity.text}</Text>
                    <Text style={styles.activityMeta}>{describe(activity)}</Text>
                    {/*
                      Which of the plan's rows are due today.

                      ⛔ This marks a day, it does not keep score. There is
                      deliberately no "2 of 3 today" and no count of what is
                      left — see the note at the top of this file. An
                      untouched row is untouched, not missed.
                    */}
                    {/*
                      "Due today", not "Today": the bottom tab bar already
                      has a tab called Today, and two different meanings for
                      one word on one screen is worse for a screen reader
                      than a longer label.
                    */}
                    {isOn(activity, weekday) && (
                      <Text style={styles.dueToday}>Due today</Text>
                    )}
                  </View>
                </Pressable>
              ))}

              <Pressable
                onPress={() => remove(goal)}
                disabled={busy === goal.id}
                style={styles.delete}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${goal.title}`}
              >
                <Text style={styles.deleteText}>Delete goal</Text>
              </Pressable>
            </View>
          ))}

          <AppButton
            label="Add another goal"
            onPress={() => navigation.navigate("GoalCreate")}
            variant="secondary"
          />
        </View>
      )}

      <Text style={styles.footnote}>
        Ticking something off is a note for yourself. MedHelp does not track whether
        you did anything, and nothing here is health advice.
      </Text>
    </Screen>
    </AppNav>
  );
}

/**
 * The schedule line beneath an activity.
 *
 * Restates the schedule the person confirmed and nothing else. An activity
 * with no days and no time says so rather than being filled in with a
 * default — an app that quietly decided someone's Monday at 09:00 would be
 * claiming a choice nobody made.
 */
function describe(activity: GoalActivity): string {
  const parts: string[] = [];

  if (activity.days.length === 7) parts.push("Every day");
  else if (activity.days.length > 0)
    parts.push(activity.days.map(shortDay).join(", "));
  else if (activity.cadence === "daily") parts.push("Every day");
  else if (activity.cadence === "times_per_week" && activity.timesPerWeek)
    parts.push(`${activity.timesPerWeek} times a week`);
  else parts.push("Whenever you choose");

  if (activity.timeOfDay) parts.push(activity.timeOfDay);
  else if (activity.preferredTime !== "unspecified") parts.push(activity.preferredTime);

  if (activity.quantityText) parts.push(activity.quantityText);
  return parts.join(" · ");
}

/**
 * Whether an activity is scheduled for the day being shown.
 *
 * An activity with no days at all is **not** treated as "every day". It is
 * treated as unscheduled and left out of the today list, because nobody
 * chose those days — the person sees it in its goal card instead.
 */
function isOn(activity: GoalActivity, day: string): boolean {
  return activity.days.includes(day as never);
}


const styles = StyleSheet.create({
  loading: { marginTop: spacing.xl },
  empty: { gap: spacing.lg, marginTop: spacing.lg },
  list: { gap: spacing.lg, marginTop: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    ...elevation.sm,
  },
  goalTitle: { ...typography.titleSmall, color: colors.textPrimary },
  activity: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: MIN_TAP_TARGET,
  },
  box: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  boxChecked: { backgroundColor: colors.accent, borderColor: colors.accent},
  activityText: { flex: 1 },
  activityLabel: { ...typography.body, color: colors.textPrimary },
  activityMeta: { ...typography.caption, color: colors.textSecondary },
  dueToday: { ...typography.caption, color: colors.accent },
  delete: { minHeight: MIN_TAP_TARGET, justifyContent: "center" },
  deleteText: { ...typography.body, color: colors.textSecondary },
  footnote: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xl,
  },
});
