import { useCallback, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { EmergencyCallBar } from "@/components/EmergencyCallBar";
import { Screen } from "@/components/Screen";
import {
  EMPTY_CARD,
  NOT_PROVIDED,
  dialableNumber,
  loadCard,
  loadMirroredMedications,
  type EmergencyCard,
  type MirroredMedication,
} from "@/services/emergencyCard";
import { MIN_TAP_TARGET, colors, radius, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "EmergencyCard">;

/**
 * What someone would want to read off a phone held out to them.
 *
 * ## ⛔ Every row is always rendered, filled or not
 *
 * A missing blood type shows as "Not provided", never as an absent row.
 * Hiding an empty field would let "no allergies shown" read as "no
 * allergies", which is the most dangerous thing this screen could imply. The
 * gap is information, and a responder scanning this needs to see it.
 *
 * ## ⛔ Nothing on this screen is checked, interpreted, or authored by MedHelp
 *
 * The values are free text the user typed, rendered verbatim. Nothing parses
 * an allergy, recognises a condition, or reasons about any of it — see the
 * module note on `emergencyCard.ts`. The screen says so out loud, because a
 * red header carries an authority the content has not earned.
 *
 * ## ⛔ No network, on purpose
 *
 * Everything here comes from on-device storage. There is no API call on this
 * screen and there must never be one: the moment this is read is the moment a
 * request is most likely to fail.
 *
 * ## Why the header is this loud
 *
 * The rest of MedHelp is deliberately calm, and this screen deliberately is
 * not. It is found under stress, possibly by someone who has never used the
 * app, so it is built to be identifiable in a glance rather than to match the
 * surrounding palette. The ground is `colors.emergencyText` — an existing
 * reviewed value from the emergency family, used here as a fill, which gives
 * white text 10.8:1 rather than the 5.3:1 the lighter border colour would.
 * No token value was changed to build this.
 */
export function EmergencyCardScreen({ navigation }: Props) {
  const [card, setCard] = useState<EmergencyCard>(EMPTY_CARD);
  const [medications, setMedications] = useState<MirroredMedication[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Reloads on return from the editor, so a change made there is on the card
  // immediately rather than after a restart.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        const [nextCard, nextMedications] = await Promise.all([
          loadCard(),
          loadMirroredMedications(),
        ]);
        if (!active) return;
        setCard(nextCard);
        setMedications(nextMedications);
        setLoaded(true);
      })();
      return () => {
        active = false;
      };
    }, [])
  );

  const phoneToDial = dialableNumber(card.contactPhone);

  const callContact = () => {
    if (!phoneToDial) return;
    // telprompt lets iOS users cancel before dialling; Android has no
    // equivalent. Same choice as `EmergencyCallBar`.
    const scheme = Platform.OS === "ios" ? "telprompt" : "tel";
    Linking.openURL(`${scheme}:${phoneToDial}`).catch(() => {
      // No dialler (the web preview, a tablet with no SIM). The number is
      // written out above the button either way.
    });
  };

  const isEmpty =
    loaded &&
    !card.bloodType &&
    !card.allergies &&
    !card.conditions &&
    !card.contactName &&
    !card.contactPhone;

  return (
    <Screen wide innerStyle={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle} accessibilityRole="header">
          EMERGENCY CARD
        </Text>
        <Text style={styles.headerSubtitle}>
          Details this phone's owner wrote down in advance. MedHelp did not
          check them and cannot confirm they are current.
        </Text>
      </View>

      {/*
        Above the card's own contents, not below them. If this screen is open
        at all, the fastest useful action on it is the call — reading the
        allergies list is the second thing, not the first.
      */}
      <EmergencyCallBar />

      {isEmpty && (
        <View style={styles.setupNotice} accessibilityRole="summary">
          <Text style={styles.setupNoticeTitle}>This card is empty</Text>
          <Text style={styles.setupNoticeText}>
            Nothing has been entered on this device yet. Filling it in takes a
            minute and it is then available without a connection.
          </Text>
        </View>
      )}

      <View style={styles.card}>
        <Field label="Blood type" value={card.bloodType} />
        <Field label="Allergies" value={card.allergies} />
        <Field label="Known conditions" value={card.conditions} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Emergency contact
        </Text>
        <Field label="Name" value={card.contactName} />
        <Field label="Relationship" value={card.contactRelationship} />
        <Field label="Phone" value={card.contactPhone} />

        {phoneToDial ? (
          <Pressable
            onPress={callContact}
            accessibilityRole="button"
            accessibilityLabel={`Call ${card.contactName || "emergency contact"}`}
            accessibilityHint={`Dials ${card.contactPhone}`}
            style={({ pressed }) => [styles.callButton, pressed && styles.callButtonPressed]}
          >
            <Text style={styles.callButtonText}>
              Call {card.contactName || "this contact"}
            </Text>
          </Pressable>
        ) : (
          <Text style={styles.fieldNote}>
            No number saved, so there is nothing to dial from here.
          </Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Current medications
        </Text>
        {/*
          A copy kept on this device so it is readable with no signal. It is
          whatever the medication list held the last time it was opened, which
          is why the screen says so rather than presenting it as live.
        */}
        {medications.length === 0 ? (
          <Text style={styles.fieldValueEmpty}>{NOT_PROVIDED}</Text>
        ) : (
          medications.map((medication) => (
            <Text key={`${medication.name}-${medication.dosage ?? ""}`} style={styles.medication}>
              {medication.dosage ? `${medication.name} — ${medication.dosage}` : medication.name}
            </Text>
          ))
        )}
        <Text style={styles.fieldNote}>
          Copied from the medication list on this device. It may be out of date
          if the list has changed since it was last opened.
        </Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {card.updatedAt
            ? `Last updated ${formatUpdatedAt(card.updatedAt)}.`
            : "This card has never been saved on this device."}
        </Text>
        <Text style={styles.footerText}>
          Stored on this device only. It works with no internet connection, and
          it does not follow you to another phone or browser.
        </Text>
      </View>

      <AppButton
        label={isEmpty ? "Fill in my emergency card" : "Edit these details"}
        onPress={() => navigation.navigate("EmergencyCardEdit")}
        accessibilityHint="Opens a form to change what this card shows"
      />
    </Screen>
  );
}

/**
 * One labelled row.
 *
 * The empty case is styled differently as well as worded differently, so it
 * is distinguishable at a glance and to a screen reader without relying on
 * either alone.
 */
function Field({ label, value }: { label: string; value: string }) {
  const provided = value.trim().length > 0;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={provided ? styles.fieldValue : styles.fieldValueEmpty}>
        {provided ? value : NOT_PROVIDED}
      </Text>
    </View>
  );
}

/** Falls back to the raw stamp rather than throwing on an unparseable one. */
function formatUpdatedAt(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return iso;
  try {
    return when.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing.lg,
  },
  header: {
    backgroundColor: colors.emergencyText,
    borderRadius: radius.md,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  headerTitle: {
    ...typography.displayLarge,
    color: colors.textOnAccent,
    letterSpacing: 1.2,
  },
  headerSubtitle: {
    ...typography.caption,
    color: colors.textOnAccent,
  },
  setupNotice: {
    backgroundColor: colors.noticeSurface,
    borderColor: colors.noticeBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  setupNoticeTitle: {
    ...typography.bodyStrong,
    color: colors.noticeText,
  },
  setupNoticeText: {
    ...typography.caption,
    color: colors.noticeText,
  },
  card: {
    backgroundColor: colors.surface,
    // A heavier edge than the rest of the app uses. This screen is scanned,
    // not read, and the blocks need to separate at a glance.
    borderColor: colors.emergencyBorder,
    borderWidth: 2,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionTitle: {
    ...typography.titleSmall,
    color: colors.emergencyText,
  },
  field: {
    gap: 2,
  },
  fieldLabel: {
    ...typography.overline,
    color: colors.textSecondary,
  },
  fieldValue: {
    ...typography.title,
    color: colors.textPrimary,
  },
  fieldValueEmpty: {
    ...typography.title,
    color: colors.textSecondary,
    fontStyle: "italic",
  },
  fieldNote: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  medication: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  callButton: {
    minHeight: MIN_TAP_TARGET,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.emergencyText,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
  },
  callButtonPressed: {
    backgroundColor: colors.emergencyBorder,
  },
  callButtonText: {
    ...typography.bodyStrong,
    color: colors.textOnAccent,
  },
  footer: {
    gap: spacing.xs,
  },
  footerText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
