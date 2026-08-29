import { useState } from "react";
import { Linking, Platform, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { EmergencyCallBar } from "@/components/EmergencyCallBar";
import { Screen } from "@/components/Screen";
import { reportAssessmentWrong } from "@/services/intakeService";
import { colors, radius, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "IntakeResult">;

/**
 * Opens the device's own maps app searching for nearby emergency care.
 *
 * JUDGEMENT CALL: this uses platform map URL schemes rather than an embedded,
 * keyed map. It needs no API key and no extra dependency, works offline-ish
 * via the installed maps app, and gets the user to turn-by-turn directions in
 * one tap. An in-app rendered map would need react-native-maps plus a Google
 * Maps key and a custom dev build — worth doing later, but not worth blocking
 * a safety feature on today.
 */
function openNearbyEmergencyCare() {
  const query = "emergency room near me";
  const url = Platform.select({
    ios: `maps:0,0?q=${encodeURIComponent(query)}`,
    android: `geo:0,0?q=${encodeURIComponent(query)}`,
    default: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
  });
  if (url) {
    Linking.openURL(url).catch(() => {
      // Falls through silently; calling 911 remains available above.
    });
  }
}

function TierBadge({ label, tone }: { label: string; tone: "emergent" | "urgent" | "self" }) {
  return (
    <View style={[styles.badge, styles[`badge_${tone}`]]}>
      <Text style={[styles.badgeText, styles[`badgeText_${tone}`]]}>{label}</Text>
    </View>
  );
}

export function IntakeResultScreen({ navigation, route }: Props) {
  const { assessment } = route.params;
  const [reported, setReported] = useState(false);

  const report = () => {
    setReported(true);
    if (assessment.id) void reportAssessmentWrong(assessment.id);
  };

  const isEmergent = assessment.tier === "EMERGENT";

  return (
    <Screen>
      {/*
        Emergency access is unconditional — present on every tier, including
        SELF_CARE. The classification is a suggestion the user may override.
      */}
      <EmergencyCallBar compact={isEmergent} />

      {isEmergent && (
        <View style={styles.emergentPanel} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          <Text style={styles.emergentHeadline}>
            {assessment.emergency?.headline ?? "Get emergency care now."}
          </Text>
          <Text style={styles.emergentBody}>
            {assessment.emergency?.action ??
              "Based on what you described, you should be evaluated immediately. Call 911 or your local emergency number, or go to an emergency department now."}
          </Text>
          <AppButton
            label="Find the nearest emergency room"
            onPress={openNearbyEmergencyCare}
            style={styles.emergentButton}
            accessibilityHint="Opens your maps app with directions to nearby emergency departments"
          />
        </View>
      )}

      <View style={styles.header}>
        <TierBadge
          label={
            assessment.tier === "EMERGENT"
              ? "Emergency care"
              : assessment.tier === "URGENT"
                ? "Urgent — be seen soon"
                : "Usually self-care"
          }
          tone={
            assessment.tier === "EMERGENT"
              ? "emergent"
              : assessment.tier === "URGENT"
                ? "urgent"
                : "self"
          }
        />
        <Text style={styles.reasoning}>{assessment.reasoning}</Text>
        {assessment.escalatedBySafetyNet && (
          <Text style={styles.escalationNote}>
            MedHelp raised this to a more urgent level than its first estimate,
            because part of what you described can be associated with more
            serious problems.
          </Text>
        )}
      </View>

      {assessment.tier === "URGENT" && (
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Booking an appointment</Text>
          <Text style={styles.sectionBody}>
            Track a visit in MedHelp so you have the details in one place. This
            does not contact a provider for you — you still need to call your
            clinic or an urgent care centre.
          </Text>
          <AppButton
            label="Find urgent care nearby"
            variant="secondary"
            onPress={openNearbyEmergencyCare}
            accessibilityHint="Opens your maps app to search for nearby urgent care"
          />
        </View>
      )}

      {assessment.tier === "SELF_CARE" && assessment.selfCareTopics.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>General information</Text>
          {assessment.selfCareTopics.map((topic) => (
            <View key={topic.topicId} style={styles.topic}>
              <Text style={styles.topicTitle}>{topic.title}</Text>
              <Text style={styles.topicSummary}>{topic.summary}</Text>
              <AppButton
                label="Read the full topic"
                variant="secondary"
                onPress={() => {
                  Linking.openURL(topic.url).catch(() => {});
                }}
                style={styles.topicLink}
              />
            </View>
          ))}
          {assessment.selfCareSourceNote && (
            <Text style={styles.sourceNote}>{assessment.selfCareSourceNote}</Text>
          )}
        </View>
      )}

      {/* The escalate-back path, shown on every tier. */}
      <View style={styles.escalation} accessible accessibilityRole="summary">
        <Text style={styles.escalationHeading}>If this changes or gets worse</Text>
        <Text style={styles.escalationBody}>{assessment.escalationGuidance}</Text>
      </View>

      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>{assessment.disclaimer}</Text>
      </View>

      <View style={styles.footerActions}>
        {reported ? (
          <Text style={styles.reportedNote}>
            Thanks — that's been noted for review. Please still seek care if
            you're worried.
          </Text>
        ) : (
          <AppButton
            label="This doesn't seem right"
            variant="secondary"
            onPress={report}
            accessibilityHint="Tells us the urgency estimate may be wrong, so it can be reviewed"
          />
        )}
        <AppButton
          label="Describe something else"
          variant="secondary"
          onPress={() => navigation.navigate("SymptomIntake")}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  emergentPanel: {
    backgroundColor: colors.emergencySurface,
    borderColor: colors.emergencyBorder,
    borderWidth: 2,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  emergentHeadline: { ...typography.display, color: colors.emergencyText },
  emergentBody: { ...typography.body, color: colors.emergencyText },
  emergentButton: {
    backgroundColor: colors.emergencyBorder,
    borderColor: colors.emergencyBorder,
    marginTop: spacing.xs,
  },
  header: { gap: spacing.sm },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  badge_emergent: {
    backgroundColor: colors.emergencySurface,
    borderColor: colors.emergencyBorder,
  },
  badge_urgent: {
    backgroundColor: colors.noticeSurface,
    borderColor: colors.noticeBorder,
  },
  badge_self: {
    backgroundColor: colors.successSurface,
    borderColor: colors.successBorder,
  },
  badgeText: { ...typography.bodyStrong },
  badgeText_emergent: { color: colors.emergencyText },
  badgeText_urgent: { color: colors.noticeText },
  badgeText_self: { color: colors.successText },
  reasoning: { ...typography.body, color: colors.textPrimary },
  escalationNote: { ...typography.caption, color: colors.textSecondary },
  section: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sectionHeading: { ...typography.title, color: colors.textPrimary },
  sectionBody: { ...typography.body, color: colors.textSecondary },
  topic: { gap: spacing.xs, paddingBottom: spacing.sm },
  topicTitle: { ...typography.bodyStrong, color: colors.textPrimary },
  topicSummary: { ...typography.caption, color: colors.textSecondary },
  topicLink: { alignSelf: "flex-start", paddingHorizontal: 0 },
  sourceNote: { ...typography.caption, color: colors.textSecondary },
  escalation: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  escalationHeading: { ...typography.bodyStrong, color: colors.textPrimary },
  escalationBody: { ...typography.caption, color: colors.textPrimary },
  disclaimer: { paddingHorizontal: spacing.xs },
  disclaimerText: { ...typography.caption, color: colors.textSecondary },
  footerActions: { gap: spacing.sm },
  reportedNote: { ...typography.caption, color: colors.textSecondary },
});
