import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { CardGrid } from "@/components/CardGrid";
import { EmergencyCardLink } from "@/components/EmergencyCardLink";
import { Glyph } from "@/components/Glyph";
import { InfoPanel } from "@/components/InfoPanel";
import { NavCard } from "@/components/NavCard";
import { Screen } from "@/components/Screen";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { listAppointments, type Appointment } from "@/services/appointmentService";
import { colors, elevation, radius, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

/**
 * Statements about the software, kept on the home screen.
 *
 * ⛔ Deliberately about the *app*, not about health. Everything here is
 * checkable against the code, and none of it is a clinical claim, a symptom
 * description, or a number about the user — see the note at the top of
 * `InfoPanel` for why a health app's empty space is the wrong place to be
 * inventive.
 *
 * This is the one panel that stayed when the home screen was consolidated,
 * because it restates CLAUDE.md's App Scope and that is the thing worth
 * saying on the way in. The other two moved to `MoreScreen`.
 */
const WHAT_IT_WILL_NOT_DO = [
  { text: "It does not diagnose, and never names a condition you might have." },
  { text: "It does not recommend a treatment or tell you what to take." },
  { text: "It does not contact a clinic or book an appointment for you." },
  { text: "It is not a substitute for advice from a healthcare professional." },
];

/**
 * Appointments the user has not finished with.
 *
 * ⛔ **Not "the next one", because MedHelp cannot know which that is.**
 * `preferred_time` is free text by design ("Thursday morning", "as soon as
 * possible") and there is no scheduled datetime on the record — CLAUDE.md
 * fences adding one until a real scheduling integration exists behind it, on
 * the grounds that a time this app invents is a time someone turns up for.
 *
 * So the list is ordered as the API orders it, newest recorded first, and the
 * screen says "most recently recorded" rather than claiming a chronology it
 * does not have.
 */
function openAppointments(appointments: Appointment[]): Appointment[] {
  return appointments.filter(
    (appointment) =>
      appointment.status === "REQUESTED" || appointment.status === "SCHEDULED"
  );
}

export function HomeScreen({ navigation }: Props) {
  const { isMedium, isExpanded } = useBreakpoint();
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);

  /**
   * The inline appointment line, and the only request this screen makes.
   *
   * Failure is silent on purpose. The home screen's job is to be four things
   * you can press; an error notice here would put a red box on the first
   * screen of the app over a line of supporting detail, and the appointment
   * list itself reports its own failures properly when opened.
   */
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void listAppointments()
        .then((loaded) => {
          if (active) setAppointments(loaded);
        })
        .catch(() => {
          if (active) setAppointments(null);
        });
      return () => {
        active = false;
      };
    }, [])
  );

  const open = openAppointments(appointments ?? []);
  const latest = open[0] ?? null;

  const destinations = (
    <View style={styles.section}>
      {/*
        Above the destination cards, not among them. The emergency card is
        found under stress by someone who is not reading, so it gets its own
        place at the top rather than a fifth tile to scan past.
      */}
      <EmergencyCardLink onPress={() => navigation.navigate("EmergencyCard")} />

      <Text style={styles.sectionLabel} accessibilityRole="header">
        WHAT WOULD YOU LIKE TO DO?
      </Text>

      <CardGrid columns={isMedium ? 2 : 1}>
        <NavCard
          icon="symptom"
          title="Not feeling well?"
          description="Describe what's wrong and get an estimate of how soon you may need care."
          onPress={() => navigation.navigate("SymptomIntake")}
        />
        {/*
          Straight to the form, not to the list. "Add medication" that opened
          a list you then had to press "Add" on would be two taps for the
          thing the card names. The list is one tap away under More.
        */}
        <NavCard
          icon="pill"
          title="Add medication"
          description="Add something you take, by typing it in or scanning the label."
          onPress={() => navigation.navigate("MedicationEdit", {})}
        />
        <NavCard
          icon="calendar"
          title="Upcoming appointments"
          description="Find a provider nearby and keep your visits in one place."
          onPress={() => navigation.navigate("AppointmentList")}
        />
        <NavCard
          icon="search"
          title="More"
          description="Your medications, reminders, past appointments and settings."
          onPress={() => navigation.navigate("More")}
        />
      </CardGrid>

      {latest && (
        <View style={styles.appointment} accessibilityRole="summary">
          <Glyph name="calendar" size={18} color={colors.accent} />
          <View style={styles.appointmentBody}>
            <Text style={styles.appointmentLabel}>MOST RECENTLY RECORDED</Text>
            <Text style={styles.appointmentName}>
              {latest.providerName}
              {/* Verbatim. MedHelp neither parses nor reformats this. */}
              {latest.preferredTime ? ` — ${latest.preferredTime}` : ""}
            </Text>
            <Text style={styles.appointmentNote}>
              {latest.status === "REQUESTED"
                ? "Not arranged yet — MedHelp has not contacted anyone."
                : "You marked this as scheduled."}
              {open.length > 1
                ? ` ${open.length - 1} other${open.length === 2 ? "" : "s"} in your list.`
                : ""}
            </Text>
          </View>
        </View>
      )}
    </View>
  );

  const aside = (
    <InfoPanel
      title="WHAT MEDHELP WILL NOT DO"
      items={WHAT_IT_WILL_NOT_DO}
      bullet="none"
      tone="muted"
    />
  );

  return (
    <Screen page innerStyle={styles.screen}>
      {/*
        The hero is decoration around the app name, not a place for numbers.
        A dashboard tile here would have to say something about the user's
        health — doses taken, symptoms logged, a score — and MedHelp knows
        none of that. Inventing one would be a clinical claim.
      */}
      <View style={[styles.hero, isExpanded && styles.heroExpanded]}>
        <View style={styles.heroText}>
          <Text style={styles.heroEyebrow}>YOUR HEALTH COMPANION</Text>
          <Text style={styles.title} accessibilityRole="header">
            MedHelp
          </Text>
          <Text style={styles.subtitle}>
            General health information and medication reminders.
          </Text>
          <View style={styles.chips}>
            {["Informational only", "No diagnosis", "No treatment advice"].map((chip) => (
              <View key={chip} style={styles.chip}>
                <Text style={styles.chipText}>{chip}</Text>
              </View>
            ))}
          </View>
        </View>

        {/*
          Only on a wide window, where the hero would otherwise be half a
          panel of empty colour. It repeats the first destination card rather
          than offering anything new — a hero that introduced a fifth thing to
          do would be four cards' worth of navigation plus a surprise.
        */}
        {isExpanded && (
          <View style={styles.heroAction}>
            <Text style={styles.heroActionLabel}>START HERE</Text>
            <Text style={styles.heroActionText}>
              Describe what's wrong in your own words. MedHelp estimates how
              soon you may need care — it never names a condition.
            </Text>
            <AppButton
              label="Not feeling well?"
              onPress={() => navigation.navigate("SymptomIntake")}
              style={styles.heroActionButton}
            />
          </View>
        )}
      </View>

      {/*
        Above `BREAKPOINT.expanded` the entry points and the scope panel sit
        side by side; below it they stack. The DOM order is the same either
        way, so a screen reader and the keyboard tab order read the
        destinations first in both layouts.

        ⛔ The panel is kept at **every** width, not dropped on a phone. Two of
        the three panels moved to More when this screen was consolidated, and
        this one did not: a narrower screen is not a reason to stop saying what
        the app will not do, and the wide layout rearranges these statements
        rather than adding them.
      */}
      <View style={[styles.body, isExpanded && styles.bodyExpanded]}>
        <View style={[styles.bodyMain, isExpanded && styles.bodyMainExpanded]}>
          {destinations}
        </View>
        <View style={[styles.bodyAside, isExpanded && styles.bodyAsideExpanded]}>
          {aside}
        </View>
      </View>

      {/*
        The full DisclaimerBanner belongs on screens that actually show
        symptom or condition information. This shorter line sets the same
        expectation on the way in without crowding the screen.

        It is styled as a quiet card rather than in the notice palette on
        purpose: the amber notice styling is reserved for the reviewed
        disclaimer, and a second thing that looks like it would blur which
        one is the real one.
      */}
      <View style={styles.scopeNote}>
        <Glyph name="alert" size={18} color={colors.textSecondary} />
        <Text style={styles.scopeNoteText}>
          MedHelp provides general information only. It does not diagnose
          conditions or recommend treatment.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing.xl,
  },
  hero: {
    backgroundColor: colors.accentDeep,
    borderRadius: radius.xl,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    gap: spacing.xs,
    ...elevation.lg,
  },
  heroExpanded: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxl,
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xxl,
  },
  heroText: {
    flex: 3,
    minWidth: 0,
    gap: spacing.xs,
  },
  heroAction: {
    flex: 2,
    minWidth: 0,
    gap: spacing.md,
    borderLeftWidth: 1,
    borderLeftColor: colors.accent,
    paddingLeft: spacing.xxl,
  },
  heroActionLabel: {
    ...typography.overline,
    color: colors.textOnAccentMuted,
  },
  heroActionText: {
    ...typography.caption,
    color: colors.textOnAccentMuted,
  },
  heroActionButton: {
    borderColor: colors.textOnAccentMuted,
  },
  heroEyebrow: {
    ...typography.overline,
    color: colors.textOnAccentMuted,
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.displayLarge,
    color: colors.textOnAccent,
  },
  subtitle: {
    ...typography.body,
    color: colors.textOnAccentMuted,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    // Drawn in the muted-on-accent pair rather than in a new colour, so the
    // hero stays two colours deep and a chip never competes with a notice.
    borderColor: colors.textOnAccentMuted,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  chipText: {
    ...typography.captionStrong,
    color: colors.textOnAccentMuted,
  },
  body: {
    gap: spacing.xl,
  },
  bodyExpanded: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  bodyMain: {
    flex: 3,
    // Stops a long card title setting this column's minimum width and
    // squeezing the aside on a mid-size window.
    minWidth: 0,
  },
  bodyMainExpanded: {
    gap: spacing.md,
  },
  bodyAside: {
    minWidth: 0,
  },
  bodyAsideExpanded: {
    flex: 2,
  },
  section: {
    gap: spacing.md,
  },
  sectionLabel: {
    ...typography.overline,
    color: colors.textSecondary,
  },
  appointment: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.accentSurface,
    borderColor: colors.accentBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  appointmentBody: {
    flex: 1,
    gap: 2,
  },
  appointmentLabel: {
    ...typography.overline,
    color: colors.textSecondary,
  },
  appointmentName: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  appointmentNote: {
    ...typography.caption,
    color: colors.textSecondary,
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
});
