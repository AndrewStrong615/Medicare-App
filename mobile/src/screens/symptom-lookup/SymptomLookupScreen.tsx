import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { CareGuidanceNotice } from "@/components/CareGuidanceNotice";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { EmergencyBanner } from "@/components/EmergencyBanner";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { NavCard } from "@/components/NavCard";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import {
  SymptomLookupError,
  searchSymptoms,
  type SymptomSearchResult,
} from "@/services/symptomService";
import { colors, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "SymptomLookup">;

export function SymptomLookupScreen({ navigation }: Props) {
  const [query, setQuery] = useState("");
  const [queryError, setQueryError] = useState<string | null>(null);
  const [result, setResult] = useState<SymptomSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [searching, setSearching] = useState(false);

  const handleSearch = async () => {
    if (searching) return;

    const trimmed = query.trim();
    if (!trimmed) {
      setQueryError("Enter a symptom or condition to search for.");
      return;
    }

    setQueryError(null);
    setError(null);
    setIsOffline(false);
    setSearching(true);

    try {
      setResult(await searchSymptoms(trimmed));
    } catch (caught) {
      setResult(null);
      if (caught instanceof SymptomLookupError) {
        setError(caught.message);
        setIsOffline(caught.isNetworkError);
      } else {
        setError("Something stopped the search. Please try again in a moment.");
      }
    } finally {
      setSearching(false);
    }
  };

  return (
    <Screen>
      {/*
        Emergency guidance is rendered before everything else on the screen —
        above the disclaimer, the search box, and any results — so someone
        describing an emergency sees it without scrolling. Required by
        CLAUDE.md; do not move it below other content.
      */}
      {result?.emergency && <EmergencyBanner guidance={result.emergency} />}

      <DisclaimerBanner />

      <View style={styles.searchRow}>
        <TextField
          label="Search symptoms or conditions"
          placeholder="e.g. sore throat"
          value={query}
          onChangeText={setQuery}
          error={queryError}
          returnKeyType="search"
          onSubmitEditing={handleSearch}
          editable={!searching}
        />
        <AppButton
          label={searching ? "Searching…" : "Search"}
          onPress={handleSearch}
          loading={searching}
          accessibilityHint="Searches the MedlinePlus health library"
        />
      </View>

      {error && <ErrorNotice message={error} onRetry={isOffline ? handleSearch : undefined} />}

      {searching && (
        <View style={styles.loading} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>Searching health information…</Text>
        </View>
      )}

      {result && !searching && (
        <View style={styles.results}>
          {result.results.length === 0 ? (
            <EmptyState
              title={`No health topics found for "${result.query}"`}
              description="Try a different word for the same symptom — for example 'sore throat' instead of 'throat hurts'. If you're worried about how you feel, contact a healthcare professional."
            />
          ) : (
            <>
              <Text style={styles.resultsHeading}>
                {result.results.length} topic{result.results.length === 1 ? "" : "s"} found
              </Text>
              {result.results.map((topic) => (
                <NavCard
                  key={topic.topicId}
                  title={topic.title}
                  description={
                    topic.groups.length > 0
                      ? `May be associated with: ${topic.groups.join(", ")}`
                      : "General health information"
                  }
                  onPress={() =>
                    navigation.navigate("SymptomDetail", {
                      topic,
                      careGuidance: result.careGuidance,
                      disclaimer: result.disclaimer,
                    })
                  }
                />
              ))}
            </>
          )}

          <CareGuidanceNotice guidance={result.careGuidance} />
          <Text style={styles.attribution}>
            Health information from {result.results[0]?.sourceName ?? "MedlinePlus"}.
          </Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    gap: spacing.md,
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
  results: {
    gap: spacing.md,
  },
  resultsHeading: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  attribution: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
