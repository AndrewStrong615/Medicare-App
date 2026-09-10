import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { EmergencyCardLink } from "@/components/EmergencyCardLink";
import { Glyph } from "@/components/Glyph";
import { InfoPanel } from "@/components/InfoPanel";
import { NavCard } from "@/components/NavCard";
import { NavGroup } from "@/components/NavGroup";
import { Screen } from "@/components/Screen";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { listAppointments, type Appointment } from "@/services/appointmentService";
import { colors, radius, spacing, typography } from "@/theme";
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
  const { isExpanded } = useBreakpoint();
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

      {/*
        ⛔ One filled action, then a group of quieter rows — the prominence
        ladder in `theme.ts`. These four used to be identical cards, which
        meant nothing was primary and a reader had to read all four before
        choosing. Symptom intake is what the app is *for*, so it is the one
        that gets the fill.
      */}
      <NavCard
        variant="primary"
        icon="symptom"
        eyebrow="START HERE"
        title="Not feeling well?"
        description="Describe what's wrong and get an estimate of how soon you may need care."
        onPress={() => navigation.navigate("SymptomIntake")}
      />

      <NavGroup>
        {/*
          Straight to the form, not to the list. "Add medication" that opened
          a list you then had to press "Add" on would be two taps for the
          thing the card names. The list is one tap away under More.
        */}
        <NavCard
          variant="row"
          icon="pill"
          title="Add medication"
          description="Add something you take, by typing it in or scanning the label."
          onPress={() => navigation.navigate("MedicationEdit", {})}
        />
        <NavCard
          variant="row"
          icon="calendar"
          title="Upcoming appointments"
          description="Find a provider nearby and keep your visits in one place."
          onPress={() => navigation.navigate("AppointmentList")}
        />
        <NavCard
          variant="row"
          icon="search"
          title="More"
          description="Your medications, reminders, past appointments and settings."
          onPress={() => navigation.navigate("More")}
        />
      </NavGroup>

      {latest && (
        <View style={styles.appointment} accessibilityRole="summary">
          <Glyph name="calendar" size={18} color={colors.textSecondary} />
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
        ⛔ A masthead, not a dashboard tile.

        This replaced a filled hero panel: with one primary action below it,
        a large block of accent colour at the top was competing with the only
        thing on the screen that is supposed to be filled.

        It is still decoration around the app name and not a place for
        numbers. A tile here would have to say something about the user's
        health — doses taken, symptoms logged, a score — and MedHelp knows
        none of that. Inventing one would be a clinical claim.
      */}
      <View style={styles.masthead}>
        <Text style={styles.mastheadEyebrow}>YOUR HEALTH COMPANION</Text>
        <Text style={styles.title} accessibilityRole="header">
          MedHelp
        </Text>
        <Text style={styles.subtitle}>
          General health information and medication reminders.
        </Text>
        <View style={styles.rule} />
        <Text style={styles.scopeLine}>
          Informational only · No diagnosis · No treatment advice
        </Text>
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

        It is styled as fine print — a hairline and nothing else — rather than
        in the notice palette on purpose: the amber notice styling is reserved
        for the reviewed disclaimer, and a second thing that looks like it
        would blur which one is the real one.
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
  masthead: {
    gap: spacing.xs,
  },
  mastheadEyebrow: {
    ...typography.overline,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.displayLarge,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  rule: {
    height: 2,
    backgroundColor: colors.textPrimary,
    marginTop: spacing.md,
  },
  scopeLine: {
    ...typography.overline,
    color: colors.textMuted,
    paddingTop: spacing.sm,
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
    color: colors.textMuted,
  },
  // L3: supporting detail. Filled, unbordered, so it does not read as another
  // thing to press.
  appointment: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  appointmentBody: {
    flex: 1,
    gap: 2,
  },
  appointmentLabel: {
    ...typography.overline,
    color: colors.textMuted,
  },
  appointmentName: {
    ...typography.titleSmall,
    color: colors.textPrimary,
  },
  appointmentNote: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  // L4: fine print. A hairline above it and no fill at all.
  scopeNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.lg,
  },
  scopeNoteText: {
    ...typography.caption,
    flex: 1,
    color: colors.textSecondary,
  },
});
