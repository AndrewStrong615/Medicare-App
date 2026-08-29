import { Linking, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { AppButton } from "@/components/AppButton";
import { CareGuidanceNotice } from "@/components/CareGuidanceNotice";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { Screen } from "@/components/Screen";
import { colors, radius, spacing, typography } from "@/theme";
import type { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "SymptomDetail">;

/**
 * Full text for one health topic.
 *
 * The summary is rendered exactly as the source wrote it. It is never
 * shortened, reworded, or split into app-authored sections — doing so would
 * turn sourced material into medical content this app wrote.
 */
export function SymptomDetailScreen({ route }: Props) {
  const { topic, careGuidance, disclaimer } = route.params;

  return (
    <Screen>
      <DisclaimerBanner />

      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          {topic.title}
        </Text>
        {topic.groups.length > 0 && (
          <Text style={styles.groups}>May be associated with: {topic.groups.join(", ")}</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionHeading}>General information</Text>
        <Text style={styles.body}>{topic.summary}</Text>
      </View>

      <CareGuidanceNotice guidance={careGuidance} />

      <View style={styles.section}>
        <Text style={styles.disclaimerText}>{disclaimer}</Text>
        <Text style={styles.attribution}>Source: {topic.sourceName}</Text>
        <AppButton
          label="Read the full topic"
          variant="secondary"
          onPress={() => {
            Linking.openURL(topic.url).catch(() => {
              // Opening a browser can fail on a locked-down device; the URL is
              // shown below so the user can still reach it.
            });
          }}
          accessibilityHint="Opens the full article on the MedlinePlus website"
          style={styles.linkButton}
        />
        <Text style={styles.url}>{topic.url}</Text>
      </View>
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
  groups: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  section: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sectionHeading: {
    ...typography.title,
    color: colors.textPrimary,
  },
  body: {
    ...typography.body,
    color: colors.textPrimary,
  },
  disclaimerText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  attribution: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  linkButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 0,
  },
  url: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
