import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import {
  MedicationError,
  createMedication,
  deleteMedication,
  updateMedication,
} from "@/services/medicationService";
import { colors, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";
import { validateIsoDate } from "@/utils/validation";

type Props = NativeStackScreenProps<RootStackParamList, "MedicationEdit">;

export function MedicationEditScreen({ navigation, route }: Props) {
  const existing = route.params?.medication;
  const isEditing = Boolean(existing);

  const [name, setName] = useState(existing?.name ?? "");
  const [dosage, setDosage] = useState(existing?.dosage ?? "");
  const [frequency, setFrequency] = useState(existing?.frequency ?? "");
  const [doctor, setDoctor] = useState(existing?.prescribingDoctor ?? "");
  const [refillDate, setRefillDate] = useState(existing?.refillDate ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");

  const [nameError, setNameError] = useState<string | null>(null);
  const [refillDateError, setRefillDateError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const busy = saving || deleting;

  const handleSave = async () => {
    if (busy) return;

    const nextNameError = name.trim() ? null : "Enter the medication name.";
    const nextDateError = validateIsoDate(refillDate);
    setNameError(nextNameError);
    setRefillDateError(nextDateError);
    setFormError(null);

    if (nextNameError || nextDateError) return;

    const input = {
      name: name.trim(),
      dosage: dosage.trim() || null,
      frequency: frequency.trim() || null,
      prescribingDoctor: doctor.trim() || null,
      refillDate: refillDate.trim() || null,
      notes: notes.trim() || null,
    };

    setSaving(true);
    try {
      if (existing) {
        await updateMedication(existing.id, input);
      } else {
        await createMedication(input);
      }
      navigation.goBack();
    } catch (caught) {
      setFormError(
        caught instanceof MedicationError
          ? caught.message
          : "Something stopped this saving. Please try again in a moment."
      );
    } finally {
      setSaving(false);
    }
  };

  const performDelete = async () => {
    if (!existing || busy) return;

    setDeleting(true);
    setFormError(null);
    try {
      await deleteMedication(existing.id);
      navigation.goBack();
    } catch (caught) {
      setFormError(
        caught instanceof MedicationError
          ? caught.message
          : "Something stopped this being deleted. Please try again."
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleDelete = () => {
    if (!existing) return;
    // Deleting loses the record outright, so it always asks first.
    Alert.alert(
      `Remove ${existing.name}?`,
      "This removes it from your medication list. It does not change anything your doctor or pharmacy has on file.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => void performDelete() },
      ]
    );
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          {isEditing ? "Edit medication" : "Add a medication"}
        </Text>
        <Text style={styles.subtitle}>
          Enter this exactly as it appears on your prescription or packaging.
          MedHelp does not check or suggest medications or dosages.
        </Text>
      </View>

      {formError && <ErrorNotice message={formError} />}

      <TextField
        label="Medication name"
        placeholder="e.g. Placebofen"
        value={name}
        onChangeText={setName}
        error={nameError}
        autoCapitalize="sentences"
        editable={!busy}
      />

      <TextField
        label="Dosage"
        placeholder="e.g. 10 mg"
        value={dosage}
        onChangeText={setDosage}
        hint="Optional"
        editable={!busy}
      />

      <TextField
        label="How often"
        placeholder="e.g. twice daily"
        value={frequency}
        onChangeText={setFrequency}
        hint="Optional"
        autoCapitalize="sentences"
        editable={!busy}
      />

      <TextField
        label="Prescribing doctor"
        placeholder="e.g. Dr. Rivera"
        value={doctor}
        onChangeText={setDoctor}
        hint="Optional"
        autoCapitalize="words"
        editable={!busy}
      />

      <TextField
        label="Refill date"
        placeholder="YYYY-MM-DD"
        value={refillDate}
        onChangeText={setRefillDate}
        error={refillDateError}
        hint="Optional. We'll flag it a week ahead."
        editable={!busy}
      />

      <TextField
        label="Notes"
        placeholder="Anything you want to remember"
        value={notes}
        onChangeText={setNotes}
        hint="Optional"
        autoCapitalize="sentences"
        editable={!busy}
      />

      <AppButton
        label={saving ? "Saving…" : isEditing ? "Save changes" : "Add medication"}
        onPress={handleSave}
        loading={saving}
        disabled={deleting}
      />

      {isEditing && (
        <AppButton
          label={deleting ? "Removing…" : "Remove this medication"}
          variant="secondary"
          onPress={handleDelete}
          loading={deleting}
          disabled={saving}
          accessibilityHint="Asks you to confirm before removing it from your list"
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
  },
  title: {
    ...typography.display,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
