import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Glyph } from "@/components/Glyph";
import { MIN_TAP_TARGET, colors, radius, spacing, typography } from "@/theme";

/**
 * The permanent, one-tap route to the emergency card.
 *
 * ## ⛔ This is a link, not guidance
 *
 * It opens a screen; it says nothing about symptoms, urgency, or what to do.
 * The route to emergency *services* is `EmergencyCallBar`, which is a
 * different component with different copy and is what the intake flow is
 * required to carry. Do not merge the two: a card of allergies is not advice
 * to call 911, and a control that did both would blur the one instruction
 * that has to be unambiguous.
 *
 * It is drawn in the emergency palette because it must be findable without
 * being read, by someone who is not calm. That is also why it never moves:
 * every screen that shows it puts it in the same place.
 */
export function EmergencyCardLink({ onPress }: { onPress: () => void }) {
  const [hovered, setHovered] = useState(false);

  // react-native-web supports hover on Pressable; the RN types do not declare
  // it, so it is added here rather than cast away. Same as `NavCard`.
  const hoverProps: { onHoverIn?: () => void; onHoverOut?: () => void } = {
    onHoverIn: () => setHovered(true),
    onHoverOut: () => setHovered(false),
  };

  return (
    <Pressable
      {...hoverProps}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Emergency card"
      accessibilityHint="Opens your allergies, conditions, blood type and emergency contact. Works without a connection."
      style={({ pressed }) => [
        styles.card,
        hovered && styles.cardHovered,
        pressed && styles.cardPressed,
      ]}
    >
      <Glyph name="alert" size={22} color={colors.emergencyText} />
      <View style={styles.body}>
        <Text style={styles.title}>Emergency card</Text>
        <Text style={styles.description}>
          Allergies, conditions, blood type and who to call. Works with no
          connection.
        </Text>
      </View>
      <Glyph name="chevron" size={16} color={colors.emergencyText} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: MIN_TAP_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.emergencySurface,
    borderColor: colors.emergencyBorder,
    borderWidth: 2,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  cardHovered: {
    backgroundColor: colors.surface,
  },
  cardPressed: {
    backgroundColor: colors.surface,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.title,
    color: colors.emergencyText,
  },
  description: {
    ...typography.caption,
    color: colors.emergencyText,
  },
});
