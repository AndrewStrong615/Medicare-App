import { StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { Glyph } from "@/components/Glyph";
import { NavCard } from "@/components/NavCard";
import { Screen } from "@/components/Screen";
import { logout } from "@/services/authService";
import { colors, elevation, radius, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

export function HomeScreen({ navigation }: Props) {
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

  return (
    <Screen wide innerStyle={styles.screen}>
      {/*
        The hero is decoration around the app name, not a place for numbers.
        A dashboard tile here would have to say something about the user's
        health — doses taken, symptoms logged, a score — and MedHelp knows
        none of that. Inventing one would be a clinical claim.
      */}
      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>YOUR HEALTH COMPANION</Text>
        <Text style={styles.title} accessibilityRole="header">
          MedHelp
        </Text>
        <Text style={styles.subtitle}>
          General health information and medication reminders.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel} accessibilityRole="header">
          WHAT WOULD YOU LIKE TO DO?
        </Text>
        <View style={styles.cards}>
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
      <AppButton
        label="Sign out"
        variant="secondary"
        onPress={handleSignOut}
        accessibilityHint="Ends your session on this device"
      />

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
  section: {
    gap: spacing.md,
  },
  sectionLabel: {
    ...typography.overline,
    color: colors.textSecondary,
  },
  cards: {
    gap: spacing.md,
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
