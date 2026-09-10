import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { AppNav } from "@/components/AppNav";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Glyph, GlyphTile } from "@/components/Glyph";
import { InfoPanel } from "@/components/InfoPanel";
import { Screen } from "@/components/Screen";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { logout } from "@/services/authService";
import { listAppointments, type Appointment } from "@/services/appointmentService";
import { listMedications, type Medication } from "@/services/medicationService";
import { listSchedules, type MedicationSchedule } from "@/services/reminderService";
import { dueState, formatTimeOfDay, sortByTime } from "@/services/reminderTiming";
import { MIN_TAP_TARGET, colors, elevation, radius, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

/**
 * The screen a signed-in user lands on.
 *
 * ## Why this is not the old hub
 *
 * Home used to be a menu of four cards, so it answered "what can this app do?"
 * on every visit. That is the right answer on the first run and the wrong one
 * on the fiftieth, by which point the question is "what is happening today?".
 * The four destinations now live in `AppNav`, which is on screen everywhere,
 * and this screen spends its space on the user's own records instead.
 *
 * ## ⛔ What may go on it
 *
 * Only three kinds of thing, and all three are the user's own data read back
 * to them:
 *
 * - reminder times **they** set,
 * - appointments **they** recorded,
 * - refill dates **they** entered.
 *
 * Nothing here may be a number about their health. MedHelp does not know
 * whether a dose was taken, so there is no "3 of 4 taken", no streak, no
 * adherence score — a time that has gone by reads "Earlier today", never
 * "missed". This is the same fence as the note at the top of `InfoPanel`, and
 * it is the reason the panels beside this content talk about the software
 * rather than about the person using it.
 *
 * ## What is deliberately absent
 *
 * A route to emergency services. `EmergencyCallBar` is escalation copy, and
 * CLAUDE.md fences *which screens show it* behind human approval obtained
 * outside the agent pipeline. Putting it here is proposed and not approved, so
 * it is not here. Do not add it on an agent's authority.
 */
export function TodayScreen({ navigation }: Props) {
  const { isExpanded } = useBreakpoint();

  const [medications, setMedications] = useState<Medication[] | null>(null);
  const [schedules, setSchedules] = useState<MedicationSchedule[] | null>(null);
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  /**
   * The three lists are independent, so one failing must not blank the other
   * two. `allSettled` keeps whatever arrived and says so once at the top,
   * rather than replacing someone's medication times with an error because
   * their appointment list timed out.
   */
  const load = useCallback(async () => {
    setLoading(true);
    const [medicationResult, scheduleResult, appointmentResult] =
      await Promise.allSettled([
        listMedications(),
        listSchedules(),
        listAppointments(),
      ]);

    if (medicationResult.status === "fulfilled") setMedications(medicationResult.value);
    if (scheduleResult.status === "fulfilled") setSchedules(scheduleResult.value);
    if (appointmentResult.status === "fulfilled") setAppointments(appointmentResult.value);

    const failed = [medicationResult, scheduleResult, appointmentResult].filter(
      (result) => result.status === "rejected"
    ).length;

    setError(
      failed === 0
        ? null
        : failed === 3
          ? "We couldn't load anything just now. Check your connection and try again."
          : "Some of today couldn't be loaded. What's shown below is up to date."
    );
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      setNow(new Date());
    }, [load])
  );

  // Keeps "Due now" and "Earlier today" honest without a re-render storm.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const handleSignOut = () => {
    void logout();
    navigation.reset({ index: 0, routes: [{ name: "Login" }] });
  };

  const times = sortByTime(
    (schedules ?? []).flatMap((schedule) =>
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

  const needingRefill = (medications ?? []).filter(
    (medication) => medication.refillOverdue || medication.refillDueSoon
  );

  // Requested first: those are the ones where nobody has been contacted yet
  // and the user still has a phone call to make. Nothing here sorts by date —
  // `preferredTime` is free text, so any ordering by "soonest" would be made
  // up. See the appointment rules in CLAUDE.md.
  const openVisits = (appointments ?? [])
    .filter((appointment) => appointment.status === "REQUESTED" || appointment.status === "SCHEDULED")
    .sort((a, b) => Number(b.status === "REQUESTED") - Number(a.status === "REQUESTED"))
    .slice(0, 2);

  const symptomAction = (
    <View style={[styles.hero, isExpanded && styles.heroExpanded]}>
      <View style={styles.heroText}>
        <Text style={styles.heroEyebrow}>NOT FEELING WELL?</Text>
        {isExpanded ? (
          <Text style={styles.heroTitle}>Describe it in your own words</Text>
        ) : null}
        <Text style={styles.heroBody}>
          MedHelp estimates how soon you may need care. It never names a
          condition and never recommends a treatment.
        </Text>
      </View>
      <AppButton
        label="Check my symptoms"
        onPress={() => navigation.navigate("SymptomIntake")}
        accessibilityHint="Opens a form to describe what is wrong"
        style={styles.heroButton}
      />
    </View>
  );

  const medicationTimes = (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionLabel} accessibilityRole="header">
          YOUR MEDICATION TIMES
        </Text>
        <Pressable
          onPress={() => navigation.navigate("MedicationReminders")}
          accessibilityRole="button"
          accessibilityLabel="Edit reminder times"
          style={styles.sectionAction}
        >
          <Text style={styles.sectionActionText}>Edit</Text>
        </Pressable>
      </View>

      {times.length === 0 ? (
        <View style={styles.quietCard}>
          <Text style={styles.quietTitle}>No reminder times set</Text>
          <Text style={styles.quietText}>
            MedHelp can suggest times from a medication's printed directions.
            You confirm them before anything is saved.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.rowCard}>
            {times.slice(0, 5).map((time, index) => {
              const state = dueState(time.timeOfDay, now);
              return (
                <View key={time.key}>
                  {index > 0 ? <View style={styles.divider} /> : null}
                  <View style={[styles.timeRow, state === "due" && styles.timeRowDue]}>
                    <Text style={[styles.time, state === "due" && styles.timeDue]}>
                      {formatTimeOfDay(time.timeOfDay, now)}
                    </Text>
                    <View style={styles.timeBody}>
                      <Text style={styles.timeName}>{time.name}</Text>
                      {time.dosage ? (
                        <Text style={styles.timeDosage}>{time.dosage}</Text>
                      ) : null}
                    </View>
                    {state === "due" ? (
                      <View style={styles.dueChip}>
                        <Text style={styles.dueChipText}>Due now</Text>
                      </View>
                    ) : (
                      <Text style={styles.timeState}>
                        {/*
                          "Earlier today", never "missed". MedHelp does not
                          know whether the dose was taken, and saying so would
                          invent a clinical fact about the user.
                        */}
                        {state === "passed" ? "Earlier today" : "Later today"}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          {times.length > 5 ? (
            <Pressable
              onPress={() => navigation.navigate("MedicationReminders")}
              accessibilityRole="button"
              style={styles.moreRow}
            >
              <Text style={styles.sectionActionText}>
                See all {times.length} times
              </Text>
            </Pressable>
          ) : null}

          <View style={styles.footnote}>
            <Glyph name="alert" size={16} color={colors.textSecondary} />
            <Text style={styles.footnoteText}>
              These are the times you set. MedHelp doesn't know whether a dose
              was taken.
            </Text>
          </View>
        </>
      )}
    </View>
  );

  const refills =
    needingRefill.length === 0 ? null : (
      <Pressable
        onPress={() => navigation.navigate("MedicationList")}
        accessibilityRole="button"
        accessibilityHint="Opens your medication list"
        style={styles.refillCard}
      >
        <Glyph name="alert" size={18} color={colors.noticeText} />
        <Text style={styles.refillText}>
          {needingRefill.length === 1
            ? "1 medication needs a refill soon."
            : `${needingRefill.length} medications need a refill soon.`}
        </Text>
        <Glyph name="chevron" size={16} color={colors.noticeText} />
      </Pressable>
    );

  const visits =
    openVisits.length === 0 ? null : (
      <View style={styles.section}>
        <Text style={styles.sectionLabel} accessibilityRole="header">
          YOUR APPOINTMENTS
        </Text>
        {openVisits.map((appointment) => (
          <Pressable
            key={appointment.id}
            onPress={() => navigation.navigate("AppointmentList")}
            accessibilityRole="button"
            accessibilityLabel={appointment.providerName}
            style={styles.visitCard}
          >
            <GlyphTile
              name="calendar"
              size={40}
              tint={
                appointment.status === "REQUESTED"
                  ? colors.noticeSurface
                  : colors.accentSurface
              }
              color={
                appointment.status === "REQUESTED"
                  ? colors.noticeText
                  : colors.accent
              }
            />
            <View style={styles.visitBody}>
              <Text style={styles.visitName}>{appointment.providerName}</Text>
              {/*
                Repeated here rather than only in the list. The one thing a
                user must not misread is whether the clinic knows — MedHelp
                contacts nobody.
              */}
              {appointment.status === "REQUESTED" ? (
                <Text style={styles.visitWarning}>
                  {appointment.providerPhone
                    ? `Not arranged yet — call ${appointment.providerPhone} to fix a time.`
                    : "Not arranged yet — call the provider to fix a time."}
                </Text>
              ) : (
                <Text style={styles.visitMeta}>
                  {appointment.preferredTime
                    ? `Scheduled · ${appointment.preferredTime}`
                    : "Scheduled"}
                </Text>
              )}
            </View>
            <Glyph name="chevron" size={16} color={colors.borderStrong} />
          </Pressable>
        ))}
      </View>
    );

  const scopeNote = (
    <View style={styles.scopeNote}>
      <Glyph name="alert" size={18} color={colors.textSecondary} />
      <Text style={styles.scopeNoteText}>
        MedHelp provides general information only. It does not diagnose
        conditions or recommend treatment.
      </Text>
    </View>
  );

  const aside = (
    <View style={styles.aside}>
      <InfoPanel
        title="WHERE YOUR INFORMATION GOES"
        items={WHERE_INFORMATION_GOES}
        footnote="MedHelp has not been reviewed by a clinician. It is a demonstration of the software rather than a medical service, and nothing in it should be relied on to decide whether you need care."
      />
      <InfoPanel
        title="WHAT MEDHELP WILL NOT DO"
        items={WHAT_IT_WILL_NOT_DO}
        bullet="none"
        tone="muted"
      />
      {scopeNote}
      {/*
        Sign-out lives in the rail on a wide window and here on a narrow one —
        one place at a time, never both.
      */}
      {isExpanded ? null : (
        <AppButton
          label="Sign out"
          variant="secondary"
          onPress={handleSignOut}
          accessibilityHint="Ends your session on this device"
          style={styles.signOut}
        />
      )}
    </View>
  );

  return (
    <AppNav
      current="Today"
      navigation={navigation}
      onSignOut={handleSignOut}
      attention={
        needingRefill.length > 0 ? { Medications: needingRefill.length } : undefined
      }
    >
      <Screen page={isExpanded} wide innerStyle={styles.screen}>
        {/*
          The rail carries the wordmark on a wide window, so repeating it here
          would name the app twice on one screen.
        */}
        {isExpanded ? null : (
          <View style={styles.topBar}>
            <View style={styles.mark}>
              <Glyph name="symptom" size={15} color={colors.textOnAccent} />
            </View>
            <Text style={styles.wordmark}>MedHelp</Text>
          </View>
        )}

        <Text style={styles.title} accessibilityRole="header">
          Today
        </Text>

        {error ? <ErrorNotice message={error} onRetry={load} /> : null}

        {loading && schedules === null && appointments === null ? (
          <View style={styles.loading} accessibilityLiveRegion="polite">
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.loadingText}>Loading your day…</Text>
          </View>
        ) : null}

        <View style={[styles.body, isExpanded && styles.bodyExpanded]}>
          <View style={[styles.main, isExpanded && styles.mainExpanded]}>
            {symptomAction}
            {refills}
            {medicationTimes}
            {visits}
          </View>
          <View style={[styles.asideColumn, isExpanded && styles.asideColumnExpanded]}>
            {aside}
          </View>
        </View>
      </Screen>
    </AppNav>
  );
}

/**
 * ⛔ Statements about the *software*, not about health and not about the user.
 * Each restates something the repository already says. See `InfoPanel`.
 */
const WHAT_IT_WILL_NOT_DO = [
  { text: "It does not diagnose, and never names a condition you might have." },
  { text: "It does not recommend a treatment or tell you what to take." },
  { text: "It does not contact a clinic or book an appointment for you." },
  { text: "It is not a substitute for advice from a healthcare professional." },
];

const WHERE_INFORMATION_GOES = [
  {
    icon: "pill" as const,
    title: "A prescription label is read on your device",
    text: "The photograph is never uploaded, and only the fields you confirm are saved.",
  },
  {
    icon: "search" as const,
    title: "A provider search carries a ZIP code and a care setting",
    text: "Never what you wrote about your symptoms, and never your exact location.",
  },
  {
    icon: "clock" as const,
    title: "Reminder times are set by you",
    text: "MedHelp proposes times from the printed directions; nothing is scheduled until you save it.",
  },
];

const styles = StyleSheet.create({
  screen: {
    gap: spacing.lg,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  mark: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    backgroundColor: colors.accentDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  wordmark: {
    ...typography.titleSmall,
    color: colors.textPrimary,
  },
  title: {
    ...typography.display,
    color: colors.textPrimary,
  },

  body: {
    gap: spacing.lg,
  },
  bodyExpanded: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xl,
  },
  main: {
    gap: spacing.lg,
    minWidth: 0,
  },
  mainExpanded: {
    flex: 3,
  },
  asideColumn: {
    minWidth: 0,
  },
  asideColumnExpanded: {
    flex: 2,
  },
  aside: {
    gap: spacing.md,
  },

  hero: {
    backgroundColor: colors.accentDeep,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    ...elevation.lg,
  },
  heroExpanded: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xxl,
  },
  heroText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  heroEyebrow: {
    ...typography.overline,
    color: colors.textOnAccentMuted,
  },
  heroTitle: {
    ...typography.title,
    color: colors.textOnAccent,
  },
  heroBody: {
    ...typography.body,
    color: colors.textOnAccentMuted,
  },
  heroButton: {
    borderColor: colors.textOnAccentMuted,
  },

  section: {
    gap: spacing.sm,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  sectionLabel: {
    ...typography.overline,
    color: colors.textSecondary,
  },
  sectionAction: {
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    marginRight: -spacing.sm,
  },
  sectionActionText: {
    ...typography.captionStrong,
    color: colors.accent,
  },

  rowCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...elevation.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.divider,
  },
  timeRow: {
    minHeight: MIN_TAP_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  timeRowDue: {
    backgroundColor: colors.accentSurface,
  },
  time: {
    width: 68,
    ...typography.captionStrong,
    color: colors.textSecondary,
  },
  timeDue: {
    color: colors.accent,
  },
  timeBody: {
    flex: 1,
    minWidth: 0,
  },
  timeName: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  timeDosage: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  timeState: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  dueChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  dueChipText: {
    ...typography.captionStrong,
    color: colors.accent,
  },
  moreRow: {
    minHeight: 32,
    justifyContent: "center",
  },
  footnote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  footnoteText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },

  quietCard: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  quietTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  quietText: {
    ...typography.caption,
    color: colors.textSecondary,
  },

  refillCard: {
    minHeight: MIN_TAP_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.noticeSurface,
    borderColor: colors.noticeBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  refillText: {
    ...typography.bodyStrong,
    color: colors.noticeText,
    flex: 1,
  },

  visitCard: {
    minHeight: MIN_TAP_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...elevation.sm,
  },
  visitBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  visitName: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  visitMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  visitWarning: {
    ...typography.caption,
    color: colors.noticeText,
  },

  scopeNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  scopeNoteText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  signOut: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },

  loading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
