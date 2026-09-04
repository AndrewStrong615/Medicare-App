import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { ErrorNotice } from "@/components/ErrorNotice";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import {
  MedicationError,
  createMedication,
  deleteMedication,
  updateMedication,
} from "@/services/medicationService";
import { colors, radius, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";
import { validateIsoDate, validateWholeNumber } from "@/utils/validation";

/** Today as YYYY-MM-DD in the device's own timezone, not UTC. */
function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

type Props = NativeStackScreenProps<RootStackParamList, "MedicationEdit">;

export function MedicationEditScreen({ navigation, route }: Props) {
  const existing = route.params?.medication;
  const isEditing = Boolean(existing);

  // Present when the form was reached by scanning a label. It prefills the
  // fields and nothing more: the user still reviews every one and presses the
  // same save button as someone who typed it in. There is deliberately no
  // path that saves a scan without this step.
  const scanned = route.params?.scanned;

  const [name, setName] = useState(existing?.name ?? scanned?.name ?? "");
  const [dosage, setDosage] = useState(existing?.dosage ?? scanned?.dosage ?? "");
  const [frequency, setFrequency] = useState(
    existing?.frequency ?? scanned?.frequency ?? ""
  );
  const [doctor, setDoctor] = useState(
    existing?.prescribingDoctor ?? scanned?.prescribingDoctor ?? ""
  );
  const [refillDate, setRefillDate] = useState(existing?.refillDate ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");

  // Supply, for the run-out estimate. Deliberately not prefilled from a scan:
  // a label prints a dispensed quantity, not how many are left today, and the
  // parser is forbidden from restating a dose either way.
  const [quantityRemaining, setQuantityRemaining] = useState(
    existing?.quantityRemaining != null ? String(existing.quantityRemaining) : ""
  );
  const [quantityCountedOn, setQuantityCountedOn] = useState(
    existing?.quantityCountedOn ?? ""
  );
  const [dosesPerDay, setDosesPerDay] = useState(
    existing?.dosesPerDay != null ? String(existing.dosesPerDay) : ""
  );

  const [nameError, setNameError] = useState<string | null>(null);
  const [refillDateError, setRefillDateError] = useState<string | null>(null);
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const [countedOnError, setCountedOnError] = useState<string | null>(null);
  const [dosesPerDayError, setDosesPerDayError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const busy = saving || deleting;

  const handleSave = async () => {
    if (busy) return;

    const nextNameError = name.trim() ? null : "Enter the medication name.";
    const nextDateError = validateIsoDate(refillDate);
    const nextQuantityError = validateWholeNumber(quantityRemaining, {
      min: 0,
      max: 10_000,
      label: "how many you have left",
    });
    const nextDosesError = validateWholeNumber(dosesPerDay, {
      min: 1,
      max: 24,
      label: "how many times a day you take this",
    });
    const nextCountedOnError = validateIsoDate(quantityCountedOn);

    setNameError(nextNameError);
    setRefillDateError(nextDateError);
    setQuantityError(nextQuantityError);
    setDosesPerDayError(nextDosesError);
    setCountedOnError(nextCountedOnError);
    setFormError(null);

    if (
      nextNameError ||
      nextDateError ||
      nextQuantityError ||
      nextDosesError ||
      nextCountedOnError
    ) {
      return;
    }

    const quantity = quantityRemaining.trim();
    const input = {
      name: name.trim(),
      dosage: dosage.trim() || null,
      frequency: frequency.trim() || null,
      prescribingDoctor: doctor.trim() || null,
      refillDate: refillDate.trim() || null,
      notes: notes.trim() || null,
      quantityRemaining: quantity ? Number(quantity) : null,
      // A count with no date could never go stale, so today stands in when the
      // user has not said otherwise. The server does the same thing if this
      // arrives null; setting it here means the form shows what was stored.
      quantityCountedOn: quantity
        ? quantityCountedOn.trim() || todayIso()
        : null,
      dosesPerDay: dosesPerDay.trim() ? Number(dosesPerDay.trim()) : null,
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
      <PageHeader
        icon="pill"
        title={isEditing ? "Edit medication" : "Add a medication"}
        subtitle="Enter this exactly as it appears on your prescription or packaging. MedHelp does not check or suggest medications or dosages."
      />

      {/*
        The confirmation step for a scanned label, and the reason scanning is
        safe to offer at all. Reading a dose off a photograph can go wrong in
        ways that look perfectly plausible on screen — "10 mg" for "70 mg" —
        so the read is presented as a draft to check, never as a result.
      */}
      {scanned && (
        <View style={styles.scanNotice} accessibilityRole="summary">
          <Text style={styles.scanNoticeTitle}>Check this against the label</Text>
          <Text style={styles.scanNoticeText}>
            These details were read from your photo and can be wrong. Compare
            each one with the label and correct anything that does not match
            before you save it.
          </Text>
          {scanned.warnings.length > 0 && (
            <Text style={styles.scanNoticeText}>
              {scanned.warnings.join(" ")} You can fill those in yourself.
            </Text>
          )}
        </View>
      )}

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

      {/*
        Supply, for the run-out estimate.

        ⛔ Nothing here is read off the directions line. MedHelp will not turn
        "TWICE DAILY" into a 2, because expanding printed directions is
        app-authored clinical content and a wrong expansion changes when
        someone takes a medicine — the same rule the label parser follows. The
        number is the user's, or it comes from reminder times they confirmed,
        or there is no estimate.
      */}
      <View style={styles.supplySection}>
        <Text style={styles.supplyHeading} accessibilityRole="header">
          Running out
        </Text>
        <Text style={styles.supplyIntro}>
          Optional. Fill these in and MedHelp can estimate when you will run
          low, and remind you before you do. It is an estimate from what you
          enter — MedHelp does not know whether you took a dose.
        </Text>
      </View>

      <TextField
        label="How many are left"
        placeholder="e.g. 30"
        value={quantityRemaining}
        onChangeText={setQuantityRemaining}
        error={quantityError}
        keyboardType="number-pad"
        hint="Optional. Count what you actually have now."
        editable={!busy}
      />

      <TextField
        label="Counted on"
        placeholder="YYYY-MM-DD"
        value={quantityCountedOn}
        onChangeText={setQuantityCountedOn}
        error={countedOnError}
        hint="Optional. Today is assumed if you leave this blank."
        editable={!busy}
      />

      <TextField
        label="Times a day you take this"
        placeholder="e.g. 2"
        value={dosesPerDay}
        onChangeText={setDosesPerDay}
        error={dosesPerDayError}
        keyboardType="number-pad"
        hint="Optional. If you leave it blank, MedHelp counts your reminder times instead."
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
  scanNotice: {
    backgroundColor: colors.noticeSurface,
    borderColor: colors.noticeBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  scanNoticeTitle: {
    ...typography.bodyStrong,
    color: colors.noticeText,
  },
  scanNoticeText: {
    ...typography.body,
    color: colors.noticeText,
  },
  supplySection: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  supplyHeading: {
    ...typography.title,
    color: colors.textPrimary,
  },
  supplyIntro: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
