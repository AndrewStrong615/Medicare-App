import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Glyph } from "@/components/Glyph";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import {
  colors,
  domains,
  elevation,
  meter,
  radius,
  spacing,
  typography,
  type DomainName,
} from "@/theme";

/**
 * The frame around sign-in and sign-up.
 *
 * On a phone this is exactly what those two screens were before: a heading, a
 * subtitle, and the form, centred in a narrow column. On a wide browser window
 * it becomes two panels — what the app is on the left, the form on the right —
 * because the sign-in screen is the first thing anyone opening the public link
 * sees, and a 480pt form floating in the middle of a 1400pt window told a
 * first-time visitor nothing at all about what they had just opened.
 *
 * ## The panel is the app's index, and it teaches the colour code
 *
 * The five rows are the five places `AppNav` navigates between, each carrying
 * the hue it will have once you are inside. So the first screen a person sees
 * is also the legend for the wayfinding they are about to use — a lab report
 * prints its reference panel for the same reason.
 *
 * That is why the panel sits on white rather than on a dark ground: the
 * colours are the thing worth looking at here, and a dark panel would mute
 * every one of them.
 *
 * ⛔ The panel is a description of the software, not a pitch and not health
 * content. Every line restates a sentence the app already shows on the home
 * screen, so signing in makes no claim that using the app then contradicts.
 * Nothing here may name a condition, suggest what a symptom means, or imply
 * the app decides anything clinical — see CLAUDE.md, App Scope.
 */
const INDEX: { domain: DomainName; name: string; text: string }[] = [
  { domain: "today", name: "Today", text: "The reminder times and appointments you have recorded." },
  { domain: "symptoms", name: "Symptoms", text: "Describe what is wrong and get an estimate of how soon you may need care." },
  { domain: "medications", name: "Medications", text: "Scan a prescription label or type it in, then set your own reminder times." },
  { domain: "care", name: "Care", text: "Search a public directory of providers and keep your visits in one place." },
  { domain: "goals", name: "Goals", text: "Write down what you intend to do, and tick it off." },
];

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function AuthShell({ title, subtitle, children }: AuthShellProps) {
  const { isExpanded } = useBreakpoint();

  const form = (
    <View style={[styles.form, isExpanded && styles.formCard]}>
      <PageHeader title={title} subtitle={subtitle} />
      {children}
    </View>
  );

  if (!isExpanded) {
    return (
      <Screen centerContent meterless>
        {form}
      </Screen>
    );
  }

  return (
    <Screen page centerContent meterless innerStyle={styles.split}>
      {/*
        The panel holds no focusable element — it is text and decorative
        marks — so putting it first costs a returning user no keyboard steps
        on the way to the email field, while a first-time visitor reads it in
        the order it is laid out.
      */}
      <View style={styles.brand}>
        <View style={styles.wordmark}>
          <View style={styles.mark}>
            <Glyph name="symptom" size={17} color={colors.textOnAccent} />
          </View>
          <Text style={styles.brandTitle} accessibilityRole="header">
            MedHelp
          </Text>
        </View>

        <Text style={styles.brandEyebrow}>Your health companion</Text>
        <Text style={styles.brandSubtitle}>
          General health information and medication reminders.
        </Text>

        <View style={styles.index}>
          {INDEX.map((entry) => {
            const hue = domains[entry.domain];
            return (
              <View key={entry.name} style={styles.indexRow}>
                <View style={[styles.indexBar, { backgroundColor: hue.fill }]} />
                <View style={styles.indexBody}>
                  <Text style={[styles.indexName, { color: hue.ink }]}>{entry.name}</Text>
                  <Text style={styles.indexText}>{entry.text}</Text>
                </View>
              </View>
            );
          })}
        </View>

        <Text style={styles.brandNote}>
          MedHelp provides general information only. It does not diagnose
          conditions or recommend treatment.
        </Text>
      </View>

      <View style={styles.formColumn}>{form}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  split: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxl,
  },
  brand: {
    flex: 5,
    minWidth: 0,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xxl,
  },
  wordmark: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  mark: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.accentDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  brandTitle: {
    ...typography.displayLarge,
    color: colors.textPrimary,
  },
  brandEyebrow: {
    ...typography.overline,
    color: colors.textMuted,
    marginTop: spacing.lg,
  },
  brandSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: 2,
  },
  index: {
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
    gap: spacing.lg,
  },
  indexRow: {
    flexDirection: "row",
    gap: spacing.lg,
  },
  indexBar: {
    width: meter.width,
    alignSelf: "stretch",
    borderRadius: meter.width / 2,
  },
  indexBody: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  indexName: {
    ...typography.bodyStrong,
  },
  indexText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  brandNote: {
    ...typography.caption,
    color: colors.textMuted,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: spacing.lg,
  },
  formColumn: {
    flex: 4,
    minWidth: 0,
  },
  form: {
    // The gap the Screen's own column used to provide. Keeping it here means
    // the fields sit the same distance apart in both layouts.
    gap: spacing.lg,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xxl,
    ...elevation.md,
  },
});
