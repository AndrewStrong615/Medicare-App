import { StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { CardGrid } from "@/components/CardGrid";
import { EmergencyCardLink } from "@/components/EmergencyCardLink";
import { InfoPanel } from "@/components/InfoPanel";
import { NavCard } from "@/components/NavCard";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { TextColumn } from "@/components/TextColumn";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { logout } from "@/services/authService";
import { colors, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "More">;

/**
 * Everything the home screen no longer shows at once.
 *
 * ## ⛔ This is a move, not a removal
 *
 * The home screen was consolidated to four things you can press. Every
 * destination that came off it is here, one tap deeper, named in full — none
 * of it was deleted and none of it is unreachable. If something ever leaves
 * the home screen without arriving here, that is a navigation dead end and a
 * bug.
 *
 * Nothing is nested further than this: a single flat list of named
 * destinations is findable, and a menu of menus is not.
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

export function MoreScreen({ navigation }: Props) {
  const { isMedium, isExpanded } = useBreakpoint();

  /**
   * The session survives a reload, so there has to be a way to end one.
   * Without this, someone signed in on a shared or borrowed browser could not
   * get out of the app short of clearing site data.
   *
   * `reset` rather than `navigate`: leaving the signed-in screens in the
   * stack would let the back gesture walk straight back into them, and they
   * would then fail one request at a time instead of saying what happened.
   *
   * This ends the session on this device only. There is no revocation, so the
   * token stays valid at the server until it expires — see `authService`.
   *
   * ⛔ It does **not** clear the emergency card, which is stored separately
   * and deliberately outlives a session. `EmergencyCardEditScreen` has "Erase
   * this card" for that.
   */
  const handleSignOut = () => {
    void logout();
    navigation.reset({ index: 0, routes: [{ name: "Login" }] });
  };

  return (
    <Screen wide page={isExpanded}>
      <TextColumn>
        <PageHeader
          icon="search"
          title="More"
          subtitle="Everything else in MedHelp. Nothing here is more than one tap from the home screen."
        />
      </TextColumn>

      <CardGrid columns={isMedium ? 2 : 1}>
        <NavCard
          icon="pill"
          title="My medications"
          description="The full list, with dosages, refill dates and how much you have left."
          onPress={() => navigation.navigate("MedicationList")}
        />
        <NavCard
          icon="clock"
          title="Medication reminders"
          description="The times you take each medication, and when to be warned about a refill."
          onPress={() => navigation.navigate("MedicationReminders")}
        />
        <NavCard
          icon="calendar"
          title="All appointments"
          description="Everything you have recorded, including visits you have finished with."
          onPress={() => navigation.navigate("AppointmentList")}
        />
        <NavCard
          icon="search"
          title="Find a provider"
          description="Search a real directory by ZIP code and the kind of care you need."
          onPress={() => navigation.navigate("ProviderSearch")}
        />
      </CardGrid>

      <TextColumn>
        <Text style={styles.sectionLabel} accessibilityRole="header">
          IN AN EMERGENCY
        </Text>
        {/*
          Repeated from the home screen rather than moved here. It is the one
          thing that must never be one tap further away than it was, and a
          person on this screen looking for it should not have to go back.
        */}
        <EmergencyCardLink onPress={() => navigation.navigate("EmergencyCard")} />
        <AppButton
          label="Edit my emergency card"
          variant="secondary"
          onPress={() => navigation.navigate("EmergencyCardEdit")}
          accessibilityHint="Opens a form to change your allergies, conditions, blood type and emergency contact"
        />
      </TextColumn>

      <TextColumn>
        <Text style={styles.sectionLabel} accessibilityRole="header">
          ABOUT MEDHELP
        </Text>
        {/*
          Both panels moved off the home screen when it was consolidated. They
          are statements about the software — see the note at the top of
          `InfoPanel` for what may and may not fill a health app's space.
        */}
        <InfoPanel title="HOW MEDHELP WORKS" items={HOW_IT_WORKS} />
        <InfoPanel
          title="WHERE YOUR INFORMATION GOES"
          items={WHERE_INFORMATION_GOES}
          footnote="MedHelp has not been reviewed by a clinician. It is a demonstration of the software rather than a medical service, and nothing in it should be relied on to decide whether you need care."
        />
      </TextColumn>

      <TextColumn>
        <Text style={styles.sectionLabel} accessibilityRole="header">
          YOUR ACCOUNT
        </Text>
        <AppButton
          label="Sign out"
          variant="secondary"
          onPress={handleSignOut}
          accessibilityHint="Ends your session on this device"
          // The secondary button is borderless by design, which reads as a
          // stray link at the end of a column of bordered cards rather than
          // under a form. Given an outline here, and only here.
          style={styles.signOut}
        />
        <Text style={styles.signOutNote}>
          This signs you out on this device. Your emergency card stays on it —
          erase that separately if you are on a shared computer.
        </Text>
      </TextColumn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    ...typography.overline,
    color: colors.textSecondary,
  },
  signOut: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  signOutNote: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
