import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { MedicationCard } from "@/components/MedicationCard";
import { Screen } from "@/components/Screen";
import {
  MedicationError,
  listMedications,
  type Medication,
} from "@/services/medicationService";
import { colors, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "MedicationList">;

export function MedicationListScreen({ navigation }: Props) {
  const [medications, setMedications] = useState<Medication[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setIsOffline(false);
    try {
      setMedications(await listMedications());
    } catch (caught) {
      if (caught instanceof MedicationError) {
        setError(caught.message);
        setIsOffline(caught.isNetworkError);
      } else {
        setError("Something stopped your medications loading. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Reloads when returning from the add/edit screen, so a change made there
  // is reflected without a manual refresh.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const needingRefill = (medications ?? []).filter(
    (medication) => medication.refillOverdue || medication.refillDueSoon
  );

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          My medications
        </Text>
        <Text style={styles.subtitle}>
          A list you keep yourself. MedHelp does not prescribe or change
          anything here.
        </Text>
      </View>

      {/*
        Two ways in, and typing it in stays the primary one. Scanning is a
        shortcut that prefills the same form; it is not a replacement for
        manual entry and never saves anything on its own.
      */}
      <View style={styles.addActions}>
        <AppButton
          label="Add a medication"
          onPress={() => navigation.navigate("MedicationEdit", {})}
          accessibilityHint="Opens a form to add a medication to your list"
        />
        <AppButton
          label="Scan a label instead"
          variant="secondary"
          onPress={() => navigation.navigate("MedicationScan")}
          accessibilityHint="Uses the camera to read a prescription label and fill in the form for you"
        />
      </View>

      {error && <ErrorNotice message={error} onRetry={isOffline ? load : undefined} />}

      {loading && medications === null && (
        <View style={styles.loading} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>Loading your medications…</Text>
        </View>
      )}

      {needingRefill.length > 0 && (
        <View style={styles.refillSummary} accessibilityRole="summary">
          <Text style={styles.refillSummaryText}>
            {needingRefill.length === 1
              ? "1 medication needs a refill soon."
              : `${needingRefill.length} medications need a refill soon.`}
          </Text>
        </View>
      )}

      {medications !== null && !error && (
        <View style={styles.list}>
          {medications.length === 0 ? (
            <EmptyState
              title="No medications yet"
              description="Add the medications you take so you can keep track of dosages, prescribing doctors, and when each one needs refilling."
            />
          ) : (
            medications.map((medication) => (
              <MedicationCard
                key={medication.id}
                medication={medication}
                onPress={() =>
                  navigation.navigate("MedicationEdit", { medication })
                }
              />
            ))
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
  },
  addActions: {
    gap: spacing.sm,
  },
  title: {
    ...typography.display,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  loading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  refillSummary: {
    backgroundColor: colors.noticeSurface,
    borderColor: colors.noticeBorder,
    borderWidth: 1,
    borderRadius: 8,
    padding: spacing.md,
  },
  refillSummaryText: {
    ...typography.bodyStrong,
    color: colors.noticeText,
  },
  list: {
    gap: spacing.md,
  },
});
