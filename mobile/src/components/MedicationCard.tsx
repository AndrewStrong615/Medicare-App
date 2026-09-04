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

/**
 * The supply-estimate badge, shown only when the estimate is inside the
 * user's lead time.
 *
 * ⛔ Every wording here contains the word "estimate", and none of them says a
 * dose was missed or that MedHelp knows how much is left. It knows what the
 * user last counted and how often they said they take it; the projection
 * assumes each dose is taken exactly on schedule, which is routinely wrong in
 * both directions.
 *
 * This is a *separate* badge from `refillLabel` above on purpose. That one
 * reports a date the user wrote down; this one reports arithmetic. Merging
 * them would let a guess inherit the authority of a record.
 */
function supplyLabel(medication: Medication): string | null {
  const { alert, daysRemaining, runOutOn } = medication.refillEstimate;
  if (!alert || runOutOn === null || daysRemaining === null) return null;

  if (daysRemaining < 0) {
    return "Estimated to have run out";
  }
  if (daysRemaining === 0) {
    return "Estimated to run out today";
  }
  return `About ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left (estimate)`;
}

type HoverProps = { onHoverIn?: () => void; onHoverOut?: () => void };

export function MedicationCard({ medication, onPress }: MedicationCardProps) {
  const [hovered, setHovered] = useState(false);
  const badge = refillLabel(medication);
  const supply = supplyLabel(medication);
  // "Run out" is a stronger statement than "due soon", so it takes the
  // stronger palette. Both are still labelled in words — colour never carries
  // this on its own.
  const supplyIsUrgent = (medication.refillEstimate.daysRemaining ?? 1) <= 0;

  const details = [medication.dosage, medication.frequency]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

  const hoverProps: HoverProps = {
    onHoverIn: () => setHovered(true),
    onHoverOut: () => setHovered(false),
  };

  const attention =
    medication.refillOverdue || medication.refillDueSoon || Boolean(supply);

  return (
    <Pressable
      {...hoverProps}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={medication.name}
      // Everything visible on the card is read out, including both refill
      // badges, so nothing is lost to someone navigating by screen reader.
      accessibilityHint={
        [details, badge, supply].filter(Boolean).join(". ") || "View details"
      }
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
      {supply && (
        <View
          style={[
            styles.badge,
            supplyIsUrgent && styles.badgeOverdue,
            attention && styles.badgeInset,
          ]}
        >
          <Text style={[styles.badgeText, supplyIsUrgent && styles.badgeTextOverdue]}>
            {supply}
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
