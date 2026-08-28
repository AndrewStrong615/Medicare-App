import { StyleSheet, Text, View } from "react-native";

/**
 * Required on every screen that shows symptom or condition information
 * (see CLAUDE.md "App Scope"). Do not remove or make this dismissible
 * without replacing it with an equally visible disclaimer.
 */
export function DisclaimerBanner() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        This app provides general information only and is not a substitute
        for professional medical advice, diagnosis, or treatment. Always
        consult a qualified healthcare professional with questions about a
        medical condition.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFF4E5",
    borderColor: "#F5A623",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    margin: 12,
  },
  text: {
    color: "#7A4A00",
    fontSize: 13,
    lineHeight: 18,
  },
});
