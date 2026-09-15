import type { ReactNode } from "react";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppButton } from "@/components/AppButton";
import { Glyph, type GlyphName } from "@/components/Glyph";
import { Wordmark } from "@/components/Mark";
import { DomainProvider } from "@/hooks/useDomain";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import {
  MIN_TAP_TARGET,
  colors,
  domains,
  meter,
  radius,
  spacing,
  typography,
  type DomainName,
} from "@/theme";

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
 * So the five places a signed-in user can be are always on screen. Which
 * shape they take is a window measurement, not a platform test — the same
 * reasoning as `useBreakpoint`:
 *
 * - below `BREAKPOINT.expanded`: a bottom tab bar, thumb-reachable one-handed
 * - at `expanded`: a left rail, because a horizontal bar pinned to the bottom
 *   of a 900pt-tall browser window is nowhere near the content it navigates
 *
 * ## Each tab owns a colour, and the colour follows you in
 *
 * A tab's hue is not decoration on the tab bar. It is the same hue as the
 * meter down the edge of the screen it opens, the tile behind that screen's
 * title, and the one filled button on it — so the answer to "where am I" is
 * on screen continuously rather than only while you are looking at the tab
 * bar. This is the colour-coded corridor that hospitals use, and it is why
 * `AppNav` sets `DomainProvider` around its children rather than each screen
 * declaring its own colour.
 *
 * See the fence on `domains` in `theme.ts`: a hue means a **place**. It may
 * never be repurposed to mean a state, a severity, or anything about the
 * person's health.
 *
 * ## Why a tab press resets rather than pushes
 *
 * These five are one flat stack, so `navigate` would push Care on top of
 * Medications and leave the back gesture walking backwards through a browsing
 * history the tab bar is supposed to replace. `reset` gives the model people
 * expect from tabs: each tab is a root, and back from any of them returns to
 * Today rather than to whichever tab was visited before.
 *
 * ## The rail's second level
 *
 * On a wide window the current tab expands to show what is inside it, so
 * "scan a label" or "find a provider" is one click from anywhere rather than
 * a tab press followed by a hunt down a screen. Only the current tab expands:
 * showing all of them at once would be a site map, which is a different and
 * much worse thing than a place to stand.
 *
 * There is no equivalent on a phone, deliberately. That space is the
 * thumb-reachable strip, and every one of these links is already on the tab's
 * own root screen; a second row of chips above the tab bar would cost a line
 * of content on every screen to save one tap on a few.
 *
 * ## What is deliberately NOT here
 *
 * No badge counts a health fact. The one badge this renders is `attention`,
 * which the caller sets from refill dates the *user* entered — a date passing
 * is arithmetic on their own data, not a claim about their health.
 */

export type TabName = "Today" | "Symptoms" | "Medications" | "Care" | "Goals";

/** The stack route that is each tab's root. */
type TabRoute =
  | "Home"
  | "SymptomIntake"
  | "MedicationList"
  | "AppointmentList"
  | "HealthGoals";

/** A destination inside a tab, offered in the rail when that tab is current. */
interface SubDestination {
  label: string;
  route: "MedicationEdit" | "MedicationScan" | "MedicationReminders" | "ProviderSearch" | "GoalCreate";
  hint: string;
}

interface Tab {
  name: TabName;
  route: TabRoute;
  icon: GlyphName;
  domain: DomainName;
  within?: readonly SubDestination[];
}

const TABS: readonly Tab[] = [
  { name: "Today", route: "Home", icon: "clock", domain: "today" },
  { name: "Symptoms", route: "SymptomIntake", icon: "symptom", domain: "symptoms" },
  {
    name: "Medications",
    route: "MedicationList",
    icon: "pill",
    domain: "medications",
    within: [
      { label: "Add a medication", route: "MedicationEdit", hint: "Opens a blank medication form" },
      { label: "Scan a label", route: "MedicationScan", hint: "Reads a prescription label with the camera" },
      { label: "Reminder times", route: "MedicationReminders", hint: "Opens your daily reminder times" },
    ],
  },
  {
    name: "Care",
    route: "AppointmentList",
    icon: "calendar",
    domain: "care",
    within: [
      { label: "Find a provider", route: "ProviderSearch", hint: "Searches the provider directory" },
    ],
  },
  {
    name: "Goals",
    route: "HealthGoals",
    icon: "check",
    domain: "goals",
    within: [{ label: "Write a goal", route: "GoalCreate", hint: "Opens a blank goal" }],
  },
];

/** Only the parts of the navigation prop this needs, so screens can pass theirs. */
interface Navigable {
  reset: (state: {
    index: number;
    routes: { name: TabRoute | "Login" }[];
  }) => void;
  navigate: (route: SubDestination["route"]) => void;
}

interface AppNavProps {
  current: TabName;
  navigation: Navigable;
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
  const currentTab = TABS.find((tab) => tab.name === current) ?? TABS[0];

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
      <DomainProvider domain={currentTab.domain}>
        <View style={styles.shell}>
          <View style={styles.rail}>
            <View style={styles.wordmark}>
              <Wordmark size={26} />
            </View>

            <View style={styles.railItems}>
              {TABS.map((tab) => (
                <View key={tab.name}>
                  <NavItem
                    tab={tab}
                    active={tab.name === current}
                    attention={attention?.[tab.name]}
                    onPress={() => go(tab)}
                    variant="rail"
                  />
                  {tab.name === current && tab.within ? (
                    <View style={styles.within}>
                      <View
                        style={[
                          styles.withinRule,
                          { backgroundColor: domains[tab.domain].border },
                        ]}
                      />
                      <View style={styles.withinItems}>
                        {tab.within.map((sub) => (
                          <SubItem
                            key={sub.route}
                            sub={sub}
                            domain={tab.domain}
                            onPress={() => navigation.navigate(sub.route)}
                          />
                        ))}
                      </View>
                    </View>
                  ) : null}
                </View>
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
      </DomainProvider>
    );
  }

  return (
    <DomainProvider domain={currentTab.domain}>
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
    </DomainProvider>
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

  const hue = domains[tab.domain];
  const tint = active ? hue.ink : colors.textSecondary;

  return (
    <Pressable
      {...hoverProps}
      onPress={onPress}
      accessibilityRole="tab"
      // ⛔ "selected" is in the label because `accessibilityState` reaches
      // nothing on web — React Native Web 0.19.13 takes `aria-selected`
      // instead and never reads it, so every tab announced identically and a
      // reader could not tell where they were. It stays for native.
      accessibilityLabel={`${tab.name}, ${active ? "selected" : "not selected"}`}
      // The count is spoken rather than left as a coloured dot, so it is not
      // lost to someone navigating by screen reader.
      accessibilityHint={
        attention ? `${attention} needing attention` : undefined
      }
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        variant === "rail" ? styles.railItem : styles.tabItem,
        variant === "rail" &&
          active && { backgroundColor: hue.surface, borderColor: hue.border },
        variant === "rail" && hovered && !active && styles.railItemHovered,
        pressed && variant === "tab" && styles.tabItemPressed,
      ]}
    >
      {/*
        The rail's active marker is a filled bar on the leading edge, in the
        tab's own colour — the same mark as the meter on the screen it opens,
        so the two read as one continuous edge across the window.
      */}
      {variant === "rail" && active ? (
        <View style={[styles.railMarker, { backgroundColor: hue.fill }]} />
      ) : null}

      <View style={variant === "rail" ? styles.railIcon : styles.tabIcon}>
        {variant === "tab" && active ? (
          <View style={[styles.tabIconActive, { backgroundColor: hue.fill }]}>
            <Glyph name={tab.icon} size={18} color={colors.textOnAccent} />
          </View>
        ) : (
          <Glyph name={tab.icon} size={variant === "rail" ? 20 : 19} color={tint} />
        )}
      </View>

      <Text
        style={[
          variant === "rail" ? styles.railLabel : styles.tabLabel,
          active && (variant === "rail" ? styles.railLabelActive : styles.tabLabelActive),
          active && { color: hue.ink },
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

function SubItem({
  sub,
  domain,
  onPress,
}: {
  sub: SubDestination;
  domain: DomainName;
  onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const hoverProps: HoverProps = {
    onHoverIn: () => setHovered(true),
    onHoverOut: () => setHovered(false),
  };
  const hue = domains[domain];

  return (
    <Pressable
      {...hoverProps}
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={sub.label}
      accessibilityHint={sub.hint}
      style={({ pressed }) => [
        styles.subItem,
        (hovered || pressed) && { backgroundColor: hue.surface },
      ]}
    >
      <Text
        style={[styles.subLabel, hovered && { color: hue.ink }]}
        numberOfLines={1}
      >
        {sub.label}
      </Text>
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
    width: 30,
    height: 30,
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
    paddingLeft: spacing.md + meter.width,
    paddingRight: spacing.md,
    overflow: "hidden",
  },
  railMarker: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: meter.width,
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
  },
  within: {
    flexDirection: "row",
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    // Lines the rule up under the centre of the tab icon above it.
    paddingLeft: spacing.md + meter.width + 9,
  },
  withinRule: {
    width: 2,
    borderRadius: 1,
  },
  withinItems: {
    flex: 1,
    paddingLeft: spacing.md,
  },
  subItem: {
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  subLabel: {
    ...typography.caption,
    color: colors.textSecondary,
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
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  tabIconActive: {
    width: 44,
    height: 28,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  tabLabel: {
    ...typography.captionStrong,
    fontSize: 13,
    letterSpacing: 0,
    color: colors.textSecondary,
  },
  tabLabelActive: {
    ...typography.overline,
    letterSpacing: 0,
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
