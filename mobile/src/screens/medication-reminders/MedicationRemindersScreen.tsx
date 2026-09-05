import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { SuccessNotice } from "@/components/SuccessNotice";
import {
  ApiError,
  listSchedules,
  toDueReminders,
  type MedicationSchedule,
} from "@/services/reminderService";
import {
  getPermission,
  refreshPermission,
  requestPermission,
  scheduleAll,
  supportsBackgroundDelivery,
  type ReminderPermission,
} from "@/services/notificationService";
import { dueState, formatTimeOfDay, sortByTime } from "@/services/reminderTiming";
import { MIN_TAP_TARGET, colors, elevation, radius, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "MedicationReminders">;

/**
 * The user's reminder schedule, and the place notifications are armed.
 *
 * ## Why the on-screen list is not decoration
 *
 * In a browser, notifications only fire while this page is open — a closed tab
 * runs no code. So the list of today's times is the part that is always
 * correct, and the notification is the bonus on top. That is stated to the
 * user rather than left for them to discover when an alarm does not arrive.
 *
 * ## Asking for permission
 *
 * Never on mount. A permission request not tied to a user gesture is
 * suppressed by browsers, and a site once blocked never prompts again — the
 * same bug that made location appear never to ask. `getPermission` only reads
 * what is already granted; the button is the only thing that asks.
 *
 * ## This is not an adherence record
 *
 * A time that has gone by is shown as "earlier today", never as "missed".
 * MedHelp does not know whether the person took it, and implying it does would
 * be inventing a clinical fact about them.
 */
export function MedicationRemindersScreen({ navigation, route }: Props) {
  const savedFor = route.params?.savedFor;

  const [schedules, setSchedules] = useState<MedicationSchedule[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [permission, setPermission] = useState<ReminderPermission>("prompt");
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNeedsSignIn(false);
    try {
      const loaded = await listSchedules();
      setSchedules(loaded);
      // Re-arm from what is actually saved, every time. This is the only
      // place notifications are scheduled, so an edit elsewhere takes effect
      // by coming back here.
      await scheduleAll(toDueReminders(loaded));
    } catch (caught) {
      const message =
        caught instanceof ApiError
          ? caught.message
          : "We couldn't load your reminders right now. Please try again.";
      setError(message);
      setNeedsSignIn(caught instanceof ApiError && caught.isAuthError);
      setSchedules(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      setPermission(await refreshPermission());
    })();
  }, []);

  // Reload on every visit: coming back from the edit screen must show the
  // times that were just saved, and re-arm them.
  useFocusEffect(
    useCallback(() => {
      void load();
      setNow(new Date());
    }, [load])
  );

  // Keeps "due now" and "earlier today" honest without a re-render storm.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const ask = useCallback(async () => {
    const result = await requestPermission();
    setPermission(result);
    if (result === "granted" && schedules) {
      await scheduleAll(toDueReminders(schedules));
    }
  }, [schedules]);

  const withReminders = (schedules ?? []).filter((item) => item.reminders.length > 0);
  const withoutReminders = (schedules ?? []).filter(
    (item) => item.reminders.length === 0
  );

  const today = sortByTime(
    withReminders.flatMap((schedule) =>
      schedule.reminders
        .filter((reminder) => reminder.enabled)
        .map((reminder) => ({
          key: reminder.id,
          timeOfDay: reminder.timeOfDay,
          name: schedule.medicationName,
          dosage: schedule.dosage,
        }))
    )
  );

  return (
    <Screen wide>
      <PageHeader
        icon="clock"
        title="Medication reminders"
        subtitle="MedHelp will remind you at the times you set. It does not track whether you have taken anything."
      />

      {savedFor && <SuccessNotice message={`Reminders saved for ${savedFor}.`} />}

      {/*
        Permission, and the honest limits of this platform. Both matter: a
        granted permission on the web still only fires while the tab is open,
        and a user who is not told that will reasonably assume otherwise.
      */}
      {permission !== "granted" && permission !== "unsupported" && (
        <View style={styles.permission}>
          <Text style={styles.permissionTitle}>
            {permission === "denied"
              ? "Notifications are blocked"
              : "Turn on notifications"}
          </Text>
          <Text style={styles.permissionText}>
            {permission === "denied"
              ? "Your browser is blocking notifications for MedHelp, so nothing will pop up. Your times are still listed below. To change it, allow notifications for this site in your browser settings and reload."
              : "Allow notifications and MedHelp will alert you at each time below. Your times are listed here either way."}
          </Text>
          {permission !== "denied" && (
            <AppButton
              label="Allow notifications"
              variant="secondary"
              onPress={() => void ask()}
              accessibilityHint="Asks your browser for permission to show reminder notifications"
            />
          )}
        </View>
      )}

      {permission === "unsupported" && (
        <View style={styles.permission}>
          <Text style={styles.permissionTitle}>
            Notifications aren't available here
          </Text>
          <Text style={styles.permissionText}>
            This device or browser can't show notifications, so MedHelp can't
            alert you. Your reminder times are listed below.
          </Text>
        </View>
      )}

      {permission === "granted" && !supportsBackgroundDelivery() && (
        <View style={styles.permission} accessibilityRole="summary">
          <Text style={styles.permissionTitle}>Keep this page open</Text>
          <Text style={styles.permissionText}>
            On the web, MedHelp can only alert you while this page is open in a
            tab. If you close it, no notification will appear — the times below
            stay correct, and the MedHelp app can remind you in the background.
          </Text>
        </View>
      )}

      {error && (
        <ErrorNotice
          message={error}
          onRetry={
            needsSignIn ? () => navigation.navigate("Login") : () => void load()
          }
          retryLabel={needsSignIn ? "Sign in" : "Try again"}
        />
      )}

      {loading && (
        <View style={styles.loading} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>Loading your reminders…</Text>
        </View>
      )}

      {!loading && schedules !== null && schedules.length === 0 && (
        <EmptyState
          icon="pill"
          title="No medications yet"
          description="Add a medication first — you can scan its label or type it in — and then set the times you want to be reminded."
        />
      )}

      {!loading && today.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Today</Text>
          {today.map((item) => {
            const state = dueState(item.timeOfDay, now);
            return (
              <View
                key={item.key}
                style={[styles.todayRow, state === "due" && styles.todayRowDue]}
              >
                <Text style={styles.todayTime}>{formatTimeOfDay(item.timeOfDay, now)}</Text>
                <View style={styles.todayBody}>
                  <Text style={styles.todayName}>{item.name}</Text>
                  {item.dosage && <Text style={styles.todayDose}>{item.dosage}</Text>}
                </View>
                <Text style={styles.todayState}>
                  {state === "due"
                    ? "Due now"
                    : state === "passed"
                      ? "Earlier today"
                      : "Later"}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {!loading && withReminders.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Your schedules</Text>
          {withReminders.map((schedule) => (
            <ScheduleRow
              key={schedule.medicationId}
              schedule={schedule}
              onPress={() =>
                navigation.navigate("ReminderEdit", {
                  medicationId: schedule.medicationId,
                  medicationName: schedule.medicationName,
                })
              }
            />
          ))}
        </View>
      )}

      {!loading && withoutReminders.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>No reminders set</Text>
          {withoutReminders.map((schedule) => (
            <ScheduleRow
              key={schedule.medicationId}
              schedule={schedule}
              onPress={() =>
                navigation.navigate("ReminderEdit", {
                  medicationId: schedule.medicationId,
                  medicationName: schedule.medicationName,
                })
              }
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

function ScheduleRow({
  schedule,
  onPress,
}: {
  schedule: MedicationSchedule;
  onPress: () => void;
}) {
  const times = sortByTime(schedule.reminders).map((reminder) =>
    formatTimeOfDay(reminder.timeOfDay)
  );

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={schedule.medicationName}
      accessibilityHint="Opens the reminder times for this medication"
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Text style={styles.rowName}>{schedule.medicationName}</Text>
      {schedule.dosage && <Text style={styles.rowDose}>{schedule.dosage}</Text>}
      <Text style={styles.rowTimes}>
        {times.length > 0 ? times.join(" · ") : "Tap to set reminder times"}
      </Text>
      {/*
        The directions, verbatim, on the row as well — so the schedule is
        always readable next to what the label actually says.
      */}
      {schedule.frequency && (
        <Text style={styles.rowFrequency} numberOfLines={2}>
          {schedule.frequency}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  permission: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    ...elevation.sm,
  },
  permissionTitle: { ...typography.bodyStrong, color: colors.textPrimary },
  permissionText: { ...typography.caption, color: colors.textSecondary },
  section: { gap: spacing.sm },
  sectionHeading: { ...typography.bodyStrong, color: colors.textSecondary },
  todayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: MIN_TAP_TARGET,
  },
  todayRowDue: {
    borderColor: colors.accent,
    borderWidth: 2,
    backgroundColor: colors.surfaceMuted,
  },
  todayTime: { ...typography.bodyStrong, color: colors.textPrimary, minWidth: 76 },
  todayBody: { flex: 1, gap: 2 },
  todayName: { ...typography.body, color: colors.textPrimary },
  todayDose: { ...typography.caption, color: colors.textSecondary },
  todayState: { ...typography.caption, color: colors.textSecondary },
  row: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    minHeight: MIN_TAP_TARGET,
    ...elevation.sm,
  },
  rowPressed: { backgroundColor: colors.surfaceMuted },
  rowName: { ...typography.bodyStrong, color: colors.textPrimary },
  rowDose: { ...typography.caption, color: colors.textSecondary },
  rowTimes: { ...typography.body, color: colors.accent, fontWeight: "600" },
  rowFrequency: { ...typography.caption, color: colors.textSecondary },
  loading: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  loadingText: { ...typography.body, color: colors.textSecondary },
});
