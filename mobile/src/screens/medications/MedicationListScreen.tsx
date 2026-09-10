import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { AppNav } from "@/components/AppNav";
import { CardGrid } from "@/components/CardGrid";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { Glyph } from "@/components/Glyph";
import { MedicationCard } from "@/components/MedicationCard";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { SegmentedControl } from "@/components/SegmentedControl";
import { TextColumn } from "@/components/TextColumn";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { getRefillLeadDays } from "@/services/appSettings";
import { mirrorMedications } from "@/services/emergencyCard";
import {
  MedicationError,
  listMedications,
  type Medication,
} from "@/services/medicationService";
import { colors, radius, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "MedicationList">;

export function MedicationListScreen({ navigation }: Props) {
  // Cards two across on a desktop window; the heading and the buttons above
  // them stay in a readable column either way. See `TextColumn`.
  const { isExpanded } = useBreakpoint();
  const [medications, setMedications] = useState<Medication[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setIsOffline(false);
    try {
      // The refill lead time is a device setting, so it is read here and
      // passed on — the server does the arithmetic, and doing it there is what
      // keeps every client flagging the same medications.
      const loaded = await listMedications(await getRefillLeadDays());
      setMedications(loaded);
      // Keep the emergency card's offline copy in step with what was just
      // fetched. The card cannot make this call itself — it has to work with
      // no signal — so this screen is where the copy gets refreshed. It never
      // throws, so a storage failure cannot cost the user their list.
      void mirrorMedications(loaded);
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
  // Counted separately from the refill dates above, and worded differently.
  // One is a date the user wrote down; this is arithmetic MedHelp did, and
  // saying so is the difference between a record and a guess.
  const runningLow = (medications ?? []).filter(
    (medication) => medication.refillEstimate.alert
  );

  return (
    <AppNav
      current="Medications"
      navigation={navigation}
      attention={
        needingRefill.length > 0 ? { Medications: needingRefill.length } : undefined
      }
    >
    <Screen wide page={isExpanded}>
      <TextColumn>
        <PageHeader
          icon="pill"
          title="My medications"
          subtitle="A list you keep yourself. MedHelp does not prescribe or change anything here."
        />

        {/*
          What you take and when you take it are two views of one list, not two
          features. They used to be separate destinations off the home hub,
          which made the user navigate between them as though a reminder meant
          anything apart from the medication it belongs to.
        */}
        <SegmentedControl
          segments={[
            { key: "list", label: "My list", hint: "The medications you have added" },
            {
              key: "times",
              label: "Reminder times",
              hint: "The times you have set for each medication",
            },
          ]}
          selected="list"
          onSelect={(key) => {
            if (key === "times") navigation.navigate("MedicationReminders");
          }}
        />

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
            <Glyph name="alert" size={18} color={colors.noticeText} />
            <Text style={styles.refillSummaryText}>
              {needingRefill.length === 1
                ? "1 medication needs a refill soon."
                : `${needingRefill.length} medications need a refill soon.`}
            </Text>
          </View>
        )}

        {runningLow.length > 0 && (
          <View style={styles.refillSummary} accessibilityRole="summary">
            <Glyph name="alert" size={18} color={colors.noticeText} />
            <Text style={styles.refillSummaryText}>
              {runningLow.length === 1
                ? "1 medication is estimated to be running low."
                : `${runningLow.length} medications are estimated to be running low.`}{" "}
              This is worked out from what you entered, not from doses taken.
            </Text>
          </View>
        )}
      </TextColumn>

      {medications !== null && !error && (
        medications.length === 0 ? (
          <TextColumn>
            <EmptyState
              icon="pill"
              title="No medications yet"
              description="Add the medications you take so you can keep track of dosages, prescribing doctors, and when each one needs refilling."
            />
          </TextColumn>
        ) : (
          <CardGrid columns={isExpanded ? 2 : 1}>
            {medications.map((medication) => (
              <MedicationCard
                key={medication.id}
                medication={medication}
                onPress={() =>
                  navigation.navigate("MedicationEdit", { medication })
                }
              />
            ))}
          </CardGrid>
        )
      )}
    </Screen>
    </AppNav>
  );
}

const styles = StyleSheet.create({
  addActions: {
    gap: spacing.sm,
  },
  loading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  refillSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.noticeSurface,
    borderColor: colors.noticeBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  refillSummaryText: {
    ...typography.bodyStrong,
    color: colors.noticeText,
    flex: 1,
  },
});
