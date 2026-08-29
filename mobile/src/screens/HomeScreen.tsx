import { StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { NavCard } from "@/components/NavCard";
import { Screen } from "@/components/Screen";
import { colors, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

export function HomeScreen({ navigation }: Props) {
  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          MedHelp
        </Text>
        <Text style={styles.subtitle}>
          General health information and medication reminders.
        </Text>
      </View>

      <View style={styles.cards}>
        <NavCard
          title="Symptom Lookup"
          description="Read general information about common symptoms and conditions."
          onPress={() => navigation.navigate("SymptomLookup")}
        />
        <NavCard
          title="My Medications"
          description="Keep a list of what you take, dosages, and refill dates."
          onPress={() => navigation.navigate("MedicationList")}
        />
        <NavCard
          title="Medication Reminders"
          description="Keep track of what to take and when."
          onPress={() => navigation.navigate("MedicationReminders")}
        />
      </View>

      {/*
        The full DisclaimerBanner belongs on screens that actually show
        symptom or condition information. This shorter line sets the same
        expectation on the way in without crowding the screen.
      */}
      <Text style={styles.scopeNote}>
        MedHelp provides general information only. It does not diagnose
        conditions or recommend treatment.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
  },
  title: {
    ...typography.display,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  cards: {
    gap: spacing.md,
  },
  scopeNote: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
