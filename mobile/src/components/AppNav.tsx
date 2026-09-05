import type { ReactNode } from "react";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppButton } from "@/components/AppButton";
import { Glyph, type GlyphName } from "@/components/Glyph";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { MIN_TAP_TARGET, colors, radius, spacing, typography } from "@/theme";

/**
 * The app's persistent navigation.
 *
 * ## Why this exists
 *
 * Every destination used to hang off a hub: Home was a menu of four cards,
 * and getting from a medication to its reminder times meant backing all the
 * way out to Home and starting again. Nothing on any other screen said where
 * you were or what else there was.
 *
 * So the four places a signed-in user can be are always on screen. Which
 * shape they take is a window measurement, not a platform test — the same
 * reasoning as `useBreakpoint`:
 *
 * - below `BREAKPOINT.expanded`: a bottom tab bar, thumb-reachable one-handed
 * - at `expanded`: a left rail, because a horizontal bar pinned to the bottom
 *   of a 900pt-tall browser window is nowhere near the content it navigates
 *
 * ## Why a tab press resets rather than pushes
 *
 * These four are one flat stack, so `navigate` would push Care on top of
 * Medications and leave the back gesture walking backwards through a browsing
 * history the tab bar is supposed to replace. `reset` gives the model people
 * expect from tabs: each tab is a root, and back from any of them returns to
 * Today rather than to whichever tab was visited before.
 *
 * ## What is deliberately NOT here
 *
 * No badge counts a health fact. The one badge this renders is `attention`,
 * which the caller sets from refill dates the *user* entered — a date passing
 * is arithmetic on their own data, not a claim about their health. MedHelp
 * does not know whether a dose was taken and nothing here may imply it does.
 */

export type TabName = "Today" | "Symptoms" | "Medications" | "Care";

/** The stack route that is each tab's root. */
type TabRoute = "Home" | "SymptomIntake" | "MedicationList" | "AppointmentList";

interface Tab {
  name: TabName;
  route: TabRoute;
  icon: GlyphName;
}

const TABS: readonly Tab[] = [
  { name: "Today", route: "Home", icon: "clock" },
  { name: "Symptoms", route: "SymptomIntake", icon: "symptom" },
  { name: "Medications", route: "MedicationList", icon: "pill" },
  { name: "Care", route: "AppointmentList", icon: "calendar" },
];

/** Only the part of the navigation prop this needs, so screens can pass theirs. */
interface Resettable {
  reset: (state: {
    index: number;
    routes: { name: TabRoute | "Login" }[];
  }) => void;
}

interface AppNavProps {
  current: TabName;
  navigation: Resettable;
  children: ReactNode;
  /**
   * Rendered at the foot of the rail, on wide windows only. Below `expanded`
   * the screen itself carries sign-out — one place at a time, never both.
   */
  onSignOut?: () => void;
  /**
   * Tabs that have something the user should look at, e.g. an overdue refill.
   * Never a number about their health — see the note above.
   */
  attention?: Partial<Record<TabName, number>>;
}

type HoverProps = { onHoverIn?: () => void; onHoverOut?: () => void };

export function AppNav({
  current,
  navigation,
  children,
  onSignOut,
  attention,
}: AppNavProps) {
  const { isExpanded } = useBreakpoint();

  const go = (tab: Tab) => {
    // Already here. Resetting would remount the screen and throw away
    // whatever the user had typed into it.
    if (tab.name === current) return;

    navigation.reset(
      tab.route === "Home"
        ? { index: 0, routes: [{ name: "Home" }] }
        : { index: 1, routes: [{ name: "Home" }, { name: tab.route }] }
    );
  };

  if (isExpanded) {
    return (
      <View style={styles.shell}>
        <View style={styles.rail}>
          <View style={styles.wordmark}>
            <View style={styles.mark}>
              <Glyph name="symptom" size={17} color={colors.textOnAccent} />
            </View>
            <Text style={styles.wordmarkText}>MedHelp</Text>
          </View>

          <View style={styles.railItems}>
            {TABS.map((tab) => (
              <NavItem
                key={tab.name}
                tab={tab}
                active={tab.name === current}
                attention={attention?.[tab.name]}
                onPress={() => go(tab)}
                variant="rail"
              />
            ))}
          </View>

          <View style={styles.railSpacer} />

          {onSignOut ? (
            <View style={styles.railFoot}>
              <AppButton
                label="Sign out"
                variant="secondary"
                onPress={onSignOut}
                accessibilityHint="Ends your session on this device"
                style={styles.signOut}
              />
            </View>
          ) : null}
        </View>

        <View style={styles.content}>{children}</View>
      </View>
    );
  }

  return (
    <View style={styles.column}>
      <View style={styles.content}>{children}</View>
      <View style={styles.tabBar} accessibilityRole="tablist">
        {TABS.map((tab) => (
          <NavItem
            key={tab.name}
            tab={tab}
            active={tab.name === current}
            attention={attention?.[tab.name]}
            onPress={() => go(tab)}
            variant="tab"
          />
        ))}
      </View>
    </View>
  );
}

function NavItem({
  tab,
  active,
  attention,
  onPress,
  variant,
}: {
  tab: Tab;
  active: boolean;
  attention?: number;
  onPress: () => void;
  variant: "tab" | "rail";
}) {
  const [hovered, setHovered] = useState(false);
  const hoverProps: HoverProps = {
    onHoverIn: () => setHovered(true),
    onHoverOut: () => setHovered(false),
  };

  const tint = active ? colors.accent : colors.textSecondary;

  return (
    <Pressable
      {...hoverProps}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={tab.name}
      // The count is spoken rather than left as a coloured dot, so it is not
      // lost to someone navigating by screen reader.
      accessibilityHint={
        attention ? `${attention} needing attention` : undefined
      }
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        variant === "rail" ? styles.railItem : styles.tabItem,
        variant === "rail" && active && styles.railItemActive,
        variant === "rail" && hovered && !active && styles.railItemHovered,
        pressed && variant === "tab" && styles.tabItemPressed,
      ]}
    >
      <View style={variant === "rail" ? styles.railIcon : styles.tabIcon}>
        {variant === "tab" && active ? (
          <View style={styles.tabIconActive}>
            <Glyph name={tab.icon} size={19} color={tint} />
          </View>
        ) : (
          <Glyph name={tab.icon} size={variant === "rail" ? 20 : 19} color={tint} />
        )}
      </View>

      <Text
        style={[
          variant === "rail" ? styles.railLabel : styles.tabLabel,
          active && (variant === "rail" ? styles.railLabelActive : styles.tabLabelActive),
        ]}
        numberOfLines={1}
      >
        {tab.name}
      </Text>

      {attention ? (
        <View style={variant === "rail" ? styles.railBadge : styles.tabBadge}>
          <Text style={styles.badgeText}>{attention}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: colors.background,
  },
  column: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    // Stops a wide child setting the row's minimum width and pushing the rail
    // off the left edge.
    minWidth: 0,
  },

  // --- rail (expanded) ---
  rail: {
    width: 264,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  wordmark: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xl,
  },
  mark: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.accentDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  wordmarkText: {
    ...typography.title,
    color: colors.textPrimary,
  },
  railItems: {
    gap: spacing.xs,
  },
  railItem: {
    minHeight: MIN_TAP_TARGET,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  railItemActive: {
    backgroundColor: colors.accentSurface,
    borderColor: colors.accentBorder,
  },
  railItemHovered: {
    backgroundColor: colors.surfaceMuted,
  },
  railIcon: {
    width: 20,
    alignItems: "center",
  },
  railLabel: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  railLabelActive: {
    ...typography.bodyStrong,
    color: colors.accent,
  },
  railSpacer: {
    flex: 1,
  },
  railFoot: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: spacing.md,
  },
  signOut: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },

  // --- tab bar (compact and medium) ---
  tabBar: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    // Clears the home indicator / gesture bar without a safe-area inset,
    // which this component cannot read from inside a plain View tree.
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  tabItem: {
    flex: 1,
    minHeight: MIN_TAP_TARGET,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  tabItemPressed: {
    opacity: 0.6,
  },
  tabIcon: {
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  tabIconActive: {
    width: 46,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  tabLabel: {
    ...typography.overline,
    fontWeight: "600",
    letterSpacing: 0,
    color: colors.textSecondary,
  },
  tabLabelActive: {
    ...typography.overline,
    letterSpacing: 0,
    color: colors.accent,
  },

  // --- attention badge ---
  tabBadge: {
    position: "absolute",
    top: 0,
    right: "22%",
    minWidth: 20,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    backgroundColor: colors.errorSurface,
    borderColor: colors.errorBorder,
    alignItems: "center",
  },
  railBadge: {
    minWidth: 24,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    borderRadius: radius.pill,
    borderWidth: 1,
    backgroundColor: colors.errorSurface,
    borderColor: colors.errorBorder,
    alignItems: "center",
  },
  badgeText: {
    ...typography.captionStrong,
    color: colors.errorText,
  },
});
