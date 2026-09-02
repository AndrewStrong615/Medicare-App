import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Glyph, GlyphTile } from "@/components/Glyph";
import { MIN_TAP_TARGET, colors, elevation, radius, spacing, typography } from "@/theme";
import type { Medication } from "@/services/medicationService";

/**
 * One medication in the list.
 *
 * Refill status is shown as a labelled badge rather than colour alone, so it
 * still reads for someone who cannot distinguish the colours or is using a
 * screen reader. The badge keeps its own border as well as its fill, so it is
 * still a distinct object in a high-contrast or greyscale rendering.
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

  const attention = medication.refillOverdue || medication.refillDueSoon;

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
      <View style={styles.row}>
        <GlyphTile
          name="pill"
          size={40}
          tint={medication.refillOverdue ? colors.errorSurface : colors.accentSurface}
          color={medication.refillOverdue ? colors.errorText : colors.accent}
        />
        <View style={styles.body}>
          <Text style={styles.name}>{medication.name}</Text>
          {details.length > 0 && <Text style={styles.details}>{details}</Text>}
          {medication.prescribingDoctor && (
            <Text style={styles.details}>Prescribed by {medication.prescribingDoctor}</Text>
          )}
        </View>
        <Glyph name="chevron" size={16} color={colors.borderStrong} />
      </View>
      {badge && (
        <View
          style={[
            styles.badge,
            medication.refillOverdue && styles.badgeOverdue,
            // Indented to the text column so the badge reads as part of this
            // medication rather than as a row of its own.
            attention && styles.badgeInset,
          ]}
        >
          <Text
            style={[styles.badgeText, medication.refillOverdue && styles.badgeTextOverdue]}
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
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...elevation.sm,
  },
  cardHovered: {
    borderColor: colors.accentBorder,
    ...elevation.md,
  },
  cardPressed: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSurface,
    ...elevation.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  body: {
    flex: 1,
    gap: 2,
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    backgroundColor: colors.noticeSurface,
    borderColor: colors.noticeBorder,
  },
  badgeInset: {
    marginLeft: 40 + spacing.md,
  },
  badgeOverdue: {
    backgroundColor: colors.errorSurface,
    borderColor: colors.errorBorder,
  },
  badgeText: {
    ...typography.captionStrong,
    color: colors.noticeText,
  },
  badgeTextOverdue: {
    color: colors.errorText,
  },
});
