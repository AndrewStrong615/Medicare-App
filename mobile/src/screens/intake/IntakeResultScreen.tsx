import { useState } from "react";
import { Linking, Platform, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { EmergencyCallBar } from "@/components/EmergencyCallBar";
import { Screen } from "@/components/Screen";
import { reportAssessmentWrong } from "@/services/intakeService";
import { colors, elevation, radius, spacing, typography } from "@/theme";
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
      {/* Decorative: the tier is already written out beside it. */}
      <View style={[styles.badgeDot, styles[`badgeDot_${tone}`]]} />
      <Text style={[styles.badgeText, styles[`badgeText_${tone}`]]}>{label}</Text>
    </View>
  );
}

export function IntakeResultScreen({ navigation, route }: Props) {
  const { assessment, description } = route.params;
  const [reported, setReported] = useState(false);
  // Emergency-tier details are collapsed by default; see the comment below.
  const [showDetails, setShowDetails] = useState(false);

  const report = () => {
    setReported(true);
    if (assessment.id) void reportAssessmentWrong(assessment.id);
  };

  const isEmergent = assessment.tier === "EMERGENT";

  /*
    The emergency screen is deliberately almost empty.

    Every other tier can afford paragraphs — the reader has time. This one is
    read by someone who may be frightened, in pain, or holding the phone for
    somebody else, and each extra block of text is another thing between them
    and the dial button. Tier badge, reasoning, escalation guidance and
    disclaimer all say some version of "get help now", which the red panel has
    already said, so on this tier they collapse behind a toggle instead of
    competing with it.

    Nothing is deleted, only demoted: "Why am I seeing this?" still reaches the
    reasoning, the disclaimer, and the report-this-is-wrong path. Note that the
    disclaimer requirement in CLAUDE.md covers screens showing symptom or
    condition information — this tier shows none, only how to get help.
  */
  if (isEmergent) {
    return (
      <Screen wide>
        <EmergencyCallBar compact />

        <View
          style={styles.emergentPanel}
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
        >
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

        <AppButton
          label={showDetails ? "Hide details" : "Why am I seeing this?"}
          variant="secondary"
          onPress={() => setShowDetails((open) => !open)}
          accessibilityHint="Shows why this was treated as an emergency"
        />

        {showDetails && (
          <View style={styles.section}>
            <Text style={styles.reasoning}>{assessment.reasoning}</Text>
            {assessment.escalatedBySafetyNet && (
              <Text style={styles.escalationNote}>
                MedHelp raised this to a more urgent level than its first
                estimate, because part of what you described can be associated
                with more serious problems.
              </Text>
            )}
            <Text style={styles.escalationBody}>{assessment.escalationGuidance}</Text>
            <Text style={styles.disclaimerText}>{assessment.disclaimer}</Text>
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
              onPress={() => navigation.navigate("SymptomIntake", { reset: true })}
            />
          </View>
        )}
      </Screen>
    );
  }

  return (
    <Screen wide>
      {/*
        Emergency access is unconditional — present on every tier, including
        SELF_CARE. The classification is a suggestion the user may override.
      */}
      <EmergencyCallBar />

      {/*
        Styling only: the rail and the card are a frame around the same badge,
        reasoning and safety-net note as before, in the same order and the
        same words.
      */}
      <View style={styles.verdict}>
        <View
          style={[
            styles.verdictRail,
            assessment.tier === "URGENT" ? styles.verdictRail_urgent : styles.verdictRail_self,
          ]}
        />
        <View style={styles.verdictBody}>
          {/* EMERGENT returned above, so only these two tiers reach here. */}
          <TierBadge
            label={
              assessment.tier === "URGENT" ? "Urgent — be seen soon" : "Usually self-care"
            }
            tone={assessment.tier === "URGENT" ? "urgent" : "self"}
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
      </View>

      {/*
        What the follow-up answers told us, and what they did not.

        This is a receipt, not an interpretation. Every value is the user's own
        text, paired with a fixed field label by the server (`summarise` in
        app/core/followup.py) — nothing here is inferred, combined, or named as
        a condition, which is what keeps it clear of the diagnosis line.

        It earns its place on the default tier in particular: "MedHelp could
        not confidently recognise what you described" is the same sentence
        every time, and "and these three things are still blank" is the part
        that actually tells someone why.
      */}
      {assessment.summary && (
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>What you told us</Text>
          {assessment.summary.understood.map((entry) => (
            <View key={entry.label} style={styles.recapRow}>
              <Text style={styles.recapLabel}>{entry.label}</Text>
              <Text style={styles.recapValue}>{entry.value}</Text>
            </View>
          ))}
          {assessment.summary.unclear.length > 0 && (
            <Text style={styles.recapUnclear}>
              Still unknown: {assessment.summary.unclear.join(", ").toLowerCase()}. That
              is part of why this estimate is cautious.
            </Text>
          )}
        </View>
      )}

      {/*
        The URGENT tier's route into the appointment flow.

        This used to hand the user to their maps app. It now stays in MedHelp:
        the search, the provider details and the record are all in-app, and
        what the user wrote is carried across so they do not describe their
        symptoms a second time to a form.

        What it deliberately does NOT do is claim to book anything. MedHelp
        cannot see a provider's calendar and cannot contact one, so the button
        says "Find a provider" and the flow it opens says the rest. Wording
        here that implied an appointment would be made for them would be worse
        on this tier than any other — this is the screen telling someone they
        should be seen soon.

        NOTE FOR REVIEW: this block sits on the intake result screen, which
        CLAUDE.md fences. It changes neither the escalation guidance nor the
        disclaimer nor which screens show them, and it does not touch the
        triage or emergency modules — but it does change what an URGENT reader
        is offered, so it belongs in the clinical reviewer's read of this
        screen rather than being treated as ordinary UI work.
      */}
      {assessment.tier === "URGENT" && (
        <View style={styles.section}>
          <Text style={styles.sectionHeading}>Being seen</Text>
          <Text style={styles.sectionBody}>
            MedHelp can help you find a provider nearby and keep the details in
            one place. It cannot make the appointment for you — you will still
            need to call — and it does not send anything to a clinic.
          </Text>
          <AppButton
            label="Find a provider"
            variant="secondary"
            onPress={() =>
              navigation.navigate("ProviderSearch", {
                intake: {
                  reasonForVisit: description ?? "",
                  tier: "URGENT",
                  assessmentId: assessment.id,
                },
              })
            }
            accessibilityHint="Searches for providers near you, without leaving MedHelp"
          />
        </View>
      )}

      {/*
        Hidden entirely while the server has the feature gated off, rather
        than shown empty. The empty state below says "we couldn't find a topic
        matching what you described", which would be a lie when no lookup was
        ever made — and an empty box invites the user to wonder what they did
        wrong. See `medlineplus_topics_enabled` in the backend config.

        EMERGENT returned above, where the only useful content is how to get
        emergency help. Text is MedlinePlus's, rendered verbatim with
        attribution — the app writes no health content of its own.
      */}
      {!assessment.topicsDisabled && (
      <View style={styles.section}>
        <Text style={styles.sectionHeading}>General information</Text>
          {assessment.relatedTopics.length > 0 ? (
            <>
              <Text style={styles.sectionBody}>
                Health topics matched to the words you used. This is background
                reading, not a diagnosis and not a description of your
                situation.
              </Text>
              {assessment.relatedTopics.map((topic) => (
                <View key={topic.topicId} style={styles.topic}>
                  <Text style={styles.topicTitle}>{topic.title}</Text>
                  <Text style={styles.topicSummary}>{topic.summary}</Text>
                  {topic.groups.length > 0 && (
                    <Text style={styles.topicGroups}>
                      May be associated with: {topic.groups.join(", ")}
                    </Text>
                  )}
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
              {assessment.topicsSourceNote && (
                <Text style={styles.sourceNote}>{assessment.topicsSourceNote}</Text>
              )}
            </>
          ) : (
            /*
              An honest empty state rather than a blank space. Saying why
              there is nothing here is the alternative to filling the gap
              with app-written content, which this app does not do.
            */
            <Text style={styles.sectionBody}>
              MedHelp couldn't find a health topic matching what you described.
              It won't write its own — everything you read here comes from
              MedlinePlus, published by the US National Library of Medicine.
            </Text>
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
          onPress={() => navigation.navigate("SymptomIntake", { reset: true })}
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
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.sm,
    // Lifted above the rest of the page. The palette is untouched; the only
    // change is that this panel now sits higher than the cards around it,
    // which is the safe direction for the one screen that says "call now".
    ...elevation.lg,
  },
  emergentHeadline: { ...typography.display, color: colors.emergencyText },
  emergentBody: { ...typography.body, color: colors.emergencyText },
  emergentButton: {
    backgroundColor: colors.emergencyBorder,
    borderColor: colors.emergencyBorder,
    marginTop: spacing.xs,
  },
  verdict: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    overflow: "hidden",
    ...elevation.sm,
  },
  verdictRail: { width: 5 },
  verdictRail_urgent: { backgroundColor: colors.noticeBorder },
  verdictRail_self: { backgroundColor: colors.successBorder },
  verdictBody: { flex: 1, padding: spacing.lg, gap: spacing.sm },
  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  badgeDot: { width: 8, height: 8, borderRadius: radius.pill },
  badgeDot_emergent: { backgroundColor: colors.emergencyText },
  badgeDot_urgent: { backgroundColor: colors.noticeText },
  badgeDot_self: { backgroundColor: colors.successText },
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
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...elevation.sm,
  },
  sectionHeading: { ...typography.title, color: colors.textPrimary },
  recapRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  recapLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    // Fixed column so the values line up as a readable list rather than a
    // ragged pair of sentences.
    width: 132,
  },
  recapValue: { ...typography.bodyStrong, color: colors.textPrimary, flex: 1 },
  recapUnclear: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  sectionBody: { ...typography.body, color: colors.textSecondary },
  topic: {
    gap: spacing.xs,
    padding: spacing.lg,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  topicTitle: { ...typography.bodyStrong, color: colors.textPrimary },
  topicSummary: { ...typography.caption, color: colors.textSecondary },
  topicGroups: { ...typography.caption, color: colors.textSecondary },
  topicLink: { alignSelf: "flex-start", paddingHorizontal: 0 },
  sourceNote: { ...typography.caption, color: colors.textSecondary },
  escalation: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderLeftWidth: 5,
    borderLeftColor: colors.accent,
    borderRadius: radius.md,
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
