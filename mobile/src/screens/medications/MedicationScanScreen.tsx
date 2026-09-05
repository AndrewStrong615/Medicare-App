import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { ErrorNotice } from "@/components/ErrorNotice";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import {
  ScanError,
  captureLabelImage,
  isScanAvailable,
  readLabel,
  type ImageSource,
} from "@/services/labelScanner";
import type { ParsedLabel } from "@/services/labelParser";
import { colors, elevation, radius, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "MedicationScan">;

/**
 * Reads a prescription label with the camera and hands the result to the
 * ordinary medication form.
 *
 * TWO RULES GOVERN THIS SCREEN.
 *
 * 1. **It never saves anything.** Every path out of here ends at
 *    `MedicationEdit`, prefilled, where the user reviews the fields and
 *    presses the same button they would have pressed after typing it in. A
 *    misread dose that saved itself would change when someone takes a
 *    medication with nobody having looked at it.
 *
 * 2. **Failure is never a dead end.** Whatever goes wrong — no native module,
 *    a refused permission, an unreadable photo — the way out is the manual
 *    form, carrying whatever was read. Scanning is a shortcut into manual
 *    entry, not a replacement for it.
 */
export function MedicationScanScreen({ navigation }: Props) {
  const [busy, setBusy] = useState<ImageSource | null>(null);
  const [error, setError] = useState<string | null>(null);

  const available = isScanAvailable();

  const goToForm = (scanned?: ParsedLabel) => {
    // `replace`, not `navigate`: once the form is open, backing up to the
    // scanner would be backing up to a step that is already finished.
    navigation.replace("MedicationEdit", scanned ? { scanned } : {});
  };

  const handleScan = async (source: ImageSource) => {
    if (busy) return;

    setBusy(source);
    setError(null);
    try {
      const uri = await captureLabelImage(source);
      // The user backed out of the camera. Not an error, and not worth a
      // message — they are looking at this screen again already.
      if (!uri) return;

      goToForm(await readLabel(uri));
    } catch (caught) {
      setError(
        caught instanceof ScanError
          ? caught.message
          : "That photo couldn't be read. You can try again, or type the details in yourself."
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <PageHeader
        icon="search"
        title="Scan a label"
        subtitle="Take a photo of your prescription label and MedHelp will fill in what it can read. You'll get a chance to check and correct every field before anything is saved."
      />

      {/*
        Stated plainly and up front, because "take a photo of your
        prescription" is a reasonable thing to be wary of. It is also true:
        `labelScanner` makes no network call, and the recognised text is
        discarded after parsing.
      */}
      <View style={styles.privacy} accessibilityRole="summary">
        <Text style={styles.privacyTitle}>Your photo stays on this device</Text>
        <Text style={styles.privacyText}>
          The label is read on your phone. The photo is not uploaded to MedHelp
          or to anyone else, and the rest of the label — your name, address and
          prescription number — is not saved anywhere.
        </Text>
      </View>

      {error && <ErrorNotice message={error} />}

      {available ? (
        <View style={styles.actions}>
          <AppButton
            label={busy === "camera" ? "Reading the label…" : "Take a photo"}
            onPress={() => void handleScan("camera")}
            loading={busy === "camera"}
            disabled={busy !== null}
            accessibilityHint="Opens the camera to photograph your prescription label"
          />
          <AppButton
            label={busy === "library" ? "Reading the label…" : "Choose an existing photo"}
            variant="secondary"
            onPress={() => void handleScan("library")}
            loading={busy === "library"}
            disabled={busy !== null}
            accessibilityHint="Picks a photo of a label you have already taken"
          />
        </View>
      ) : (
        <View style={styles.unavailable} accessibilityLiveRegion="polite">
          <Text style={styles.unavailableText}>
            Scanning isn't available on this device or in this version of the
            app. You can add the medication by typing it in instead.
          </Text>
        </View>
      )}

      {/*
        Always present, never behind a failure. Manual entry is the path that
        always works, and it stays one tap away whether or not the scan did.
      */}
      <AppButton
        label="Type it in myself"
        variant="secondary"
        onPress={() => goToForm()}
        disabled={busy !== null}
        accessibilityHint="Opens the blank medication form"
      />

      <Text style={styles.footnote}>
        MedHelp does not check or suggest medications or dosages. Reading a
        label from a photo can get things wrong, so check what it fills in
        against the label itself.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  privacy: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  privacyTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  privacyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  actions: {
    gap: spacing.sm,
  },
  unavailable: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...elevation.sm,
  },
  unavailableText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  footnote: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
