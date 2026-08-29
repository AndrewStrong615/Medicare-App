import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { MIN_TAP_TARGET, colors, radius, spacing, typography } from "@/theme";
import type { Medication } from "@/services/medicationService";

/**
 * One medication in the list.
 *
 * Refill status is shown as a labelled badge rather than colour alone, so it
 * still reads for someone who cannot distinguish the colours or is using a
 * screen reader.
 */
interface MedicationCardProps {
  medication: Medication;
  onPress: () => void;
}

function refillLabel(medication: Medication): string | null {
  const { refillOverdue, refillDueSoon, daysUntilRefill } = medication;

  if (refillOverdue) {
    const days = Math.abs(daysUntilRefill ?? 0);
    return days === 0
      ? "Refill was due today"
      : `Refill overdue by ${days} day${days === 1 ? "" : "s"}`;
  }
  if (refillDueSoon) {
    if (daysUntilRefill === 0) return "Refill due today";
    return `Refill due in ${daysUntilRefill} day${daysUntilRefill === 1 ? "" : "s"}`;
  }
  return null;
}

type HoverProps = { onHoverIn?: () => void; onHoverOut?: () => void };

export function MedicationCard({ medication, onPress }: MedicationCardProps) {
  const [hovered, setHovered] = useState(false);
  const badge = refillLabel(medication);

  const details = [medication.dosage, medication.frequency]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

  const hoverProps: HoverProps = {
    onHoverIn: () => setHovered(true),
    onHoverOut: () => setHovered(false),
  };

  return (
    <Pressable
      {...hoverProps}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={medication.name}
      // Everything visible on the card is read out, including refill status,
      // so it is not lost to someone navigating by screen reader.
      accessibilityHint={[details, badge].filter(Boolean).join(". ") || "View details"}
      style={({ pressed }) => [
        styles.card,
        hovered && styles.cardHovered,
        pressed && styles.cardPressed,
      ]}
    >
      <Text style={styles.name}>{medication.name}</Text>
      {details.length > 0 && <Text style={styles.details}>{details}</Text>}
      {medication.prescribingDoctor && (
        <Text style={styles.details}>Prescribed by {medication.prescribingDoctor}</Text>
      )}
      {badge && (
        <View style={[styles.badge, medication.refillOverdue && styles.badgeOverdue]}>
          <Text
            style={[
              styles.badgeText,
              medication.refillOverdue && styles.badgeTextOverdue,
            ]}
          >
            {badge}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: MIN_TAP_TARGET,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  cardHovered: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceMuted,
  },
  cardPressed: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceMuted,
  },
  name: {
    ...typography.title,
    color: colors.textPrimary,
  },
  details: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  badge: {
    alignSelf: "flex-start",
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    backgroundColor: colors.noticeSurface,
    borderColor: colors.noticeBorder,
  },
  badgeOverdue: {
    backgroundColor: colors.errorSurface,
    borderColor: colors.errorBorder,
  },
  badgeText: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.noticeText,
  },
  badgeTextOverdue: {
    color: colors.errorText,
  },
});
