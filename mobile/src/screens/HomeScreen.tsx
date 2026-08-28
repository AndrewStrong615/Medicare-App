import { Button, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

export function HomeScreen({ navigation }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>MedHelp</Text>
      <Text style={styles.subtitle}>
        General health information and medication reminders.
      </Text>
      <View style={styles.actions}>
        <Button
          title="Symptom Lookup"
          onPress={() => navigation.navigate("SymptomLookup")}
        />
        <Button
          title="Medication Reminders"
          onPress={() => navigation.navigate("MedicationReminders")}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: "700" },
  subtitle: { fontSize: 14, color: "#555", marginBottom: 24 },
  actions: { gap: 12 },
});
