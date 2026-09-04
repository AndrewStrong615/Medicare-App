import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { GlyphTile, type GlyphName } from "@/components/Glyph";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { colors, elevation, radius, spacing, typography } from "@/theme";

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
 * ⛔ The left panel is a description of the software, not a pitch and not
 * health content. Every line in `FEATURES` restates a sentence the app already
 * shows on the home screen, so signing in makes no claim that using the app
 * then contradicts. Nothing here may name a condition, suggest what a symptom
 * means, or imply the app decides anything clinical — see CLAUDE.md, App Scope.
 */
const FEATURES: { icon: GlyphName; title: string; text: string }[] = [
  {
    icon: "symptom",
    title: "Check my symptoms",
    text: "Describe what's wrong and get an estimate of how soon you may need care.",
  },
  {
    icon: "pill",
    title: "Medications and reminders",
    text: "Scan a prescription label or type it in, then set your own reminder times.",
  },
  {
    icon: "calendar",
    title: "Providers and appointments",
    text: "Search a public directory of providers and keep your visits in one place.",
  },
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
      <PageHeader eyebrow="MEDHELP" title={title} subtitle={subtitle} />
      {children}
    </View>
  );

  if (!isExpanded) return <Screen centerContent>{form}</Screen>;

  return (
    <Screen page centerContent innerStyle={styles.split}>
      {/*
        The panel holds no focusable element — it is text and decorative
        glyphs — so putting it first costs a returning user no keyboard steps
        on the way to the email field, while a first-time visitor reads it in
        the order it is laid out.
      */}
      <View style={styles.brand}>
        <Text style={styles.brandEyebrow}>YOUR HEALTH COMPANION</Text>
        <Text style={styles.brandTitle} accessibilityRole="header">
          MedHelp
        </Text>
        <Text style={styles.brandSubtitle}>
          General health information and medication reminders.
        </Text>

        <View style={styles.features}>
          {FEATURES.map((feature) => (
            <View key={feature.title} style={styles.feature}>
              <GlyphTile
                name={feature.icon}
                size={40}
                tint={colors.accent}
                color={colors.textOnAccent}
              />
              <View style={styles.featureBody}>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureText}>{feature.text}</Text>
              </View>
            </View>
          ))}
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
    backgroundColor: colors.accentDeep,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    gap: spacing.xs,
    ...elevation.lg,
  },
  brandEyebrow: {
    ...typography.overline,
    color: colors.textOnAccentMuted,
    marginBottom: spacing.xs,
  },
  brandTitle: {
    ...typography.displayLarge,
    color: colors.textOnAccent,
  },
  brandSubtitle: {
    ...typography.body,
    color: colors.textOnAccentMuted,
  },
  features: {
    gap: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
  },
  feature: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  featureBody: {
    flex: 1,
    gap: 2,
  },
  featureTitle: {
    ...typography.bodyStrong,
    color: colors.textOnAccent,
  },
  featureText: {
    ...typography.caption,
    color: colors.textOnAccentMuted,
  },
  brandNote: {
    ...typography.caption,
    color: colors.textOnAccentMuted,
    borderTopWidth: 1,
    borderTopColor: colors.accent,
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
