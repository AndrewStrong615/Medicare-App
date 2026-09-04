import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { ErrorNotice } from "@/components/ErrorNotice";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import {
  EMPTY_CARD,
  clearCard,
  loadCard,
  saveCard,
  type EmergencyCard,
} from "@/services/emergencyCard";
import { colors, radius, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "EmergencyCardEdit">;

/**
 * The one place the emergency card is written.
 *
 * ## ⛔ Free text, and only free text
 *
 * There is no picker of conditions, no list of common allergies, and nothing
 * that validates a blood type. Offering a menu of conditions would make
 * MedHelp the author of a clinical vocabulary, and checking a blood group
 * would imply a verification that has not happened. The user writes what they
 * know; the app stores the characters.
 *
 * ## ⛔ A failed save is reported, never swallowed
 *
 * Storage refuses in ordinary situations — Safari private browsing, a browser
 * blocking site data, a keystore that is unavailable. Someone who believes
 * they have recorded a penicillin allergy and has not is materially worse off
 * than someone who is told the save failed, so the error goes on the screen
 * and the user stays on the form.
 */
export function EmergencyCardEditScreen({ navigation }: Props) {
  const [card, setCard] = useState<EmergencyCard>(EMPTY_CARD);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void loadCard().then((loaded) => {
      if (active) setCard(loaded);
    });
    return () => {
      active = false;
    };
  }, []);

  const busy = saving || clearing;

  const set = (field: keyof EmergencyCard) => (value: string) =>
    setCard((current) => ({ ...current, [field]: value }));

  const handleSave = async () => {
    if (busy) return;
    setSaving(true);
    setError(null);
    try {
      await saveCard(card);
      navigation.goBack();
    } catch {
      setError(
        "This device would not save your card. If you are browsing privately or have site data blocked, try again in a normal window."
      );
    } finally {
      setSaving(false);
    }
  };

  const performClear = async () => {
    setClearing(true);
    setError(null);
    try {
      await clearCard();
      setCard(EMPTY_CARD);
    } finally {
      setClearing(false);
    }
  };

  const handleClear = () => {
    // Clearing loses everything on the card, and the card is the thing that is
    // meant to be there in an emergency, so it always asks first.
    Alert.alert(
      "Erase this emergency card?",
      "This removes your details and the copy of your medication list from this device. It does not change your medication list itself.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Erase", style: "destructive", onPress: () => void performClear() },
      ]
    );
  };

  return (
    <Screen>
      <PageHeader
        icon="alert"
        title="Your emergency card"
        subtitle="Write down what someone helping you would need to know. MedHelp does not check any of it and never sends it anywhere."
      />

      {/*
        Said before the first field rather than after the save button. The
        person deciding what to type is the person who needs to know where it
        goes and who else can read it.
      */}
      <View style={styles.storageNotice} accessibilityRole="summary">
        <Text style={styles.storageNoticeTitle}>Where this is kept</Text>
        <Text style={styles.storageNoticeText}>
          On this device only. It is not sent to MedHelp's servers, so it works
          with no connection — and it does not follow you to another phone or
          browser.
        </Text>
        <Text style={styles.storageNoticeText}>
          On a shared or borrowed computer it stays behind after you sign out.
          Use "Erase this card" below before you walk away from one.
        </Text>
      </View>

      {error && <ErrorNotice message={error} />}

      <TextField
        label="Blood type"
        placeholder="e.g. O positive"
        value={card.bloodType}
        onChangeText={set("bloodType")}
        hint="Optional. Write it exactly as you know it — MedHelp does not check it."
        editable={!busy}
      />

      <TextField
        label="Allergies"
        placeholder="e.g. penicillin, peanuts"
        value={card.allergies}
        onChangeText={set("allergies")}
        hint="Optional. Anything a responder should know before treating you."
        autoCapitalize="sentences"
        multiline
        editable={!busy}
      />

      <TextField
        label="Known conditions"
        placeholder="e.g. type 1 diabetes, asthma"
        value={card.conditions}
        onChangeText={set("conditions")}
        hint="Optional. Conditions you have been diagnosed with."
        autoCapitalize="sentences"
        multiline
        editable={!busy}
      />

      <Text style={styles.sectionHeading} accessibilityRole="header">
        Emergency contact
      </Text>

      <TextField
        label="Name"
        placeholder="e.g. Sam Rivera"
        value={card.contactName}
        onChangeText={set("contactName")}
        hint="Optional"
        autoCapitalize="words"
        editable={!busy}
      />

      <TextField
        label="Relationship"
        placeholder="e.g. sister"
        value={card.contactRelationship}
        onChangeText={set("contactRelationship")}
        hint="Optional"
        editable={!busy}
      />

      <TextField
        label="Phone number"
        placeholder="e.g. 555 0100"
        value={card.contactPhone}
        onChangeText={set("contactPhone")}
        keyboardType="phone-pad"
        hint="Optional. The card shows this exactly as you type it, with a button to call it."
        editable={!busy}
      />

      <AppButton
        label={saving ? "Saving…" : "Save my emergency card"}
        onPress={handleSave}
        loading={saving}
        disabled={clearing}
      />

      <AppButton
        label={clearing ? "Erasing…" : "Erase this card"}
        variant="secondary"
        onPress={handleClear}
        loading={clearing}
        disabled={saving}
        accessibilityHint="Asks you to confirm before removing these details from this device"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  storageNotice: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  storageNoticeTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  storageNoticeText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  sectionHeading: {
    ...typography.title,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
});
