import { StyleSheet, Text, View } from "react-native";

import { DisclaimerBanner } from "@/components/DisclaimerBanner";

/**
 * Navigation stub only — no symptom/condition content yet. When this is
 * built out, run it past the compliance-reviewer subagent (see CLAUDE.md)
 * and keep DisclaimerBanner visible on this screen at all times.
 */
export function SymptomLookupScreen() {
  return (
    <View style={styles.container}>
      <DisclaimerBanner />
      <View style={styles.body}>
        <Text style={styles.placeholder}>Symptom lookup coming soon.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1, alignItems: "center", justifyContent: "center" },
  placeholder: { fontSize: 16, color: "#555" },
});
