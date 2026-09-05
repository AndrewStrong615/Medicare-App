import { StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { CardGrid } from "@/components/CardGrid";
import { Glyph } from "@/components/Glyph";
import { InfoPanel } from "@/components/InfoPanel";
import { NavCard } from "@/components/NavCard";
import { Screen } from "@/components/Screen";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { logout } from "@/services/authService";
import { colors, elevation, radius, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

/**
 * Short factual statements about the software, shown beside the entry points.
 *
 * ⛔ These are deliberately about the *app*, not about health. Everything here
 * is checkable against the code, and none of it is a clinical claim, a symptom
 * description, or a number about the user — see the note at the top of
 * `InfoPanel` for why a health app's empty space is the wrong place to be
 * inventive.
 *
 * The wording restates statements the repository already makes rather than
 * adding new ones: the "will not do" list is CLAUDE.md's App Scope, and the
 * data lines are the on-device-scanning and provider-search rules.
 */
const HOW_IT_WORKS = [
  {
    step: "1",
    title: "Describe it in your own words",
    text: "Type or dictate what is going on. Plain language is what the app expects.",
  },
  {
    step: "2",
    title: "Get an estimate of timing",
    text: "MedHelp estimates how soon you may need care, and shows you what you told it.",
  },
  {
    step: "3",
    title: "Keep the rest in one place",
    text: "Your medications, the times you take them, and a record of your appointments.",
  },
];

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

export function HomeScreen({ navigation }: Props) {
  // Two columns of sections beside each other only once there is genuinely
  // room for both. Below that this is the same stacked screen it has always
  // been on a phone.
  const { isMedium, isExpanded } = useBreakpoint();

  /**
   * The session now survives a reload, so there has to be a way to end one.
   * Without this, someone signed in on a shared or borrowed browser could not
   * get out of the app short of clearing site data.
   *
   * `reset` rather than `navigate`: leaving the signed-in screens in the
   * stack would let the back gesture walk straight back into them, and they
   * would then fail one request at a time instead of saying what happened.
   *
   * This ends the session on this device only. There is no revocation, so the
   * token stays valid at the server until it expires — see `authService`.
   */
  const handleSignOut = () => {
    void logout();
    navigation.reset({ index: 0, routes: [{ name: "Login" }] });
  };

  const destinations = (
    <View style={styles.section}>
      <Text style={styles.sectionLabel} accessibilityRole="header">
        WHAT WOULD YOU LIKE TO DO?
      </Text>
      <CardGrid columns={isMedium ? 2 : 1}>
        <NavCard
          icon="symptom"
          title="Check my symptoms"
          description="Describe what's wrong and get an estimate of how soon you may need care."
          onPress={() => navigation.navigate("SymptomIntake")}
        />
        <NavCard
          icon="calendar"
          title="My Appointments"
          description="Find a provider nearby and keep your visits in one place."
          onPress={() => navigation.navigate("AppointmentList")}
        />
        <NavCard
          icon="pill"
          title="My Medications"
          description="Keep a list of what you take, dosages, and refill dates."
          onPress={() => navigation.navigate("MedicationList")}
        />
        <NavCard
          icon="clock"
          title="Medication Reminders"
          description="Keep track of what to take and when."
          onPress={() => navigation.navigate("MedicationReminders")}
        />
      </CardGrid>
    </View>
  );

  const dataPanel = (
    <InfoPanel
      title="WHERE YOUR INFORMATION GOES"
      items={WHERE_INFORMATION_GOES}
      footnote="MedHelp has not been reviewed by a clinician. It is a demonstration of the software rather than a medical service, and nothing in it should be relied on to decide whether you need care."
    />
  );

  const aside = (
    <View style={styles.aside}>
      <InfoPanel title="HOW MEDHELP WORKS" items={HOW_IT_WORKS} />
      <InfoPanel
        title="WHAT MEDHELP WILL NOT DO"
        items={WHAT_IT_WILL_NOT_DO}
        bullet="none"
        tone="muted"
      />
      <AppButton
        label="Sign out"
        variant="secondary"
        onPress={handleSignOut}
        accessibilityHint="Ends your session on this device"
        // The secondary button is borderless by design, which reads as a
        // stray link when it ends a column of bordered cards rather than
        // sitting under a form. Given an outline here, and only here.
        style={styles.signOut}
      />
    </View>
  );

  return (
    <Screen page innerStyle={styles.screen}>
      {/*
        The hero is decoration around the app name, not a place for numbers.
        A dashboard tile here would have to say something about the user's
        health — doses taken, symptoms logged, a score — and MedHelp knows
        none of that. Inventing one would be a clinical claim.

        The chips under the subtitle compress the same three statements the
        scope note at the foot of the screen makes. They repeat rather than
        add, on purpose: what this app is not is the one thing worth saying
        twice on the way in.
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
              label="Check my symptoms"
              onPress={() => navigation.navigate("SymptomIntake")}
              // The accent fill sits close to the hero's ground, so the
              // outline is what gives the control an edge to aim at.
              style={styles.heroActionButton}
            />
          </View>
        )}
      </View>

      {/*
        Above `BREAKPOINT.expanded` the entry points and the explanatory panels
        sit side by side; below it they stack. The DOM order is the same
        either way, so a screen reader and the keyboard tab order read the
        destinations first in both layouts.
      */}
      <View style={[styles.body, isExpanded && styles.bodyExpanded]}>
        <View style={[styles.bodyMain, isExpanded && styles.bodyMainExpanded]}>
          {destinations}
          {/*
            Under the cards on a wide window, where it balances the two panels
            beside it; full width below one, where a third column of anything
            would only make the page longer.
          */}
          {isExpanded ? dataPanel : null}
        </View>
        <View style={[styles.bodyAside, isExpanded && styles.bodyAsideExpanded]}>{aside}</View>
      </View>

      {isExpanded ? null : dataPanel}

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
  signOut: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  bodyAside: {
    minWidth: 0,
  },
  bodyAsideExpanded: {
    flex: 2,
  },
  aside: {
    gap: spacing.md,
  },
  section: {
    gap: spacing.md,
  },
  sectionLabel: {
    ...typography.overline,
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
