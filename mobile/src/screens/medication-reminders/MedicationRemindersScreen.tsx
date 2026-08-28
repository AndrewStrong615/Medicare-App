import { StyleSheet, Text, View } from "react-native";

/**
 * Navigation stub only. This screen manages the user's own reminder data
 * (not symptom/condition info), so it doesn't require DisclaimerBanner —
 * but if it ever surfaces dosage suggestions or drug interaction content,
 * route that change through compliance-reviewer first (see CLAUDE.md).
 */
export function MedicationRemindersScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>Medication reminders coming soon.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  placeholder: { fontSize: 16, color: "#555" },
});
