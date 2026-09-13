import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DomainProvider, useDomain } from "@/hooks/useDomain";
import { CONTENT_WIDTH, colors, meter, spacing, type DomainName } from "@/theme";

/**
 * Shared page frame: consistent background and padding, keeps content clear of
 * the keyboard, and scrolls when content doesn't fit.
 *
 * Scrolling matters for accessibility as much as for small screens — at large
 * system font sizes these screens overflow even on a big phone, and a
 * non-scrolling View would put the submit button permanently out of reach.
 *
 * It also draws **the meter**: the measured colour edge down the leading side
 * of the page that says which part of the app this is. See the note on
 * `meter` in `theme.ts` for why that mark earns its place, and `useDomain`
 * for how a screen declares which colour it takes.
 */
interface ScreenProps {
  children: ReactNode;
  /** Vertically centres content — for short screens like sign-in. */
  centerContent?: boolean;
  /**
   * Widens the content column from form width to list width. Forms stay
   * narrow because a long input line is hard to scan; lists and result
   * screens carry cards that look starved in a 480pt column on a tablet.
   */
  wide?: boolean;
  /**
   * Full page width, for a screen that lays *columns* out beside each other
   * rather than stretching one column.
   *
   * ⛔ Do not reach for this to make a list or a form look less lonely on a
   * desktop. A 1180pt line of body text is harder to read than a 660pt one,
   * and this app is read by people who are unwell. Only pass it when the
   * children actually split into columns below that width — the Today screen
   * does, above `BREAKPOINT.expanded`.
   */
  page?: boolean;
  /**
   * Which destination this screen belongs to, for screens pushed on top of a
   * tab root. The tab roots themselves inherit it from `AppNav` and should
   * leave this alone.
   */
  domain?: DomainName;
  /**
   * Hides the colour edge. For screens that are not inside the app's
   * navigation at all — sign-in, sign-up — where there is no destination to
   * be oriented within yet.
   */
  meterless?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  /** Overrides the spacing rhythm of the content column itself. */
  innerStyle?: StyleProp<ViewStyle>;
}

export function Screen({ domain, children, ...rest }: ScreenProps) {
  if (domain) {
    return (
      <DomainProvider domain={domain}>
        <ScreenBody {...rest}>{children}</ScreenBody>
      </DomainProvider>
    );
  }

  return <ScreenBody {...rest}>{children}</ScreenBody>;
}

function ScreenBody({
  children,
  centerContent = false,
  wide = false,
  page = false,
  meterless = false,
  contentStyle,
  innerStyle,
}: Omit<ScreenProps, "domain">) {
  const insets = useSafeAreaInsets();
  const { ink } = useDomain();

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      // iOS slides content up; Android's adjustResize (Expo's default) already
      // handles this, and enabling it there causes double-padding.
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/*
        Decoration and orientation, never information on its own — whatever
        this edge says, the screen's own title says in words. So it is hidden
        from assistive technology rather than given a label that would be read
        out before every screen.
      */}
      {meterless ? null : (
        <View
          style={[styles.meter, { backgroundColor: ink }]}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      )}

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          centerContent && styles.centered,
          meterless && styles.contentMeterless,
          // The navigator draws the header, so only the bottom inset (home
          // indicator / gesture bar) needs adding here.
          { paddingBottom: spacing.xl + insets.bottom },
          contentStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        alwaysBounceVertical={false}
      >
        <View
          style={[
            styles.inner,
            wide && styles.innerWide,
            page && styles.innerPage,
            innerStyle,
          ]}
        >
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  meter: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: meter.width,
    // Sits above the scrolling content so it reads as an edge of the page
    // rather than as something printed on the page.
    zIndex: 1,
  },
  content: {
    flexGrow: 1,
    padding: spacing.xl,
    // Clears the meter, so a card's left edge does not sit flush against it.
    paddingLeft: spacing.xl + meter.width,
  },
  contentMeterless: {
    paddingLeft: spacing.xl,
  },
  centered: {
    justifyContent: "center",
  },
  inner: {
    // Keeps line lengths readable on tablets and in the browser preview
    // instead of stretching a form across the full width.
    width: "100%",
    maxWidth: CONTENT_WIDTH.form,
    alignSelf: "center",
    gap: spacing.lg,
  },
  innerWide: {
    maxWidth: CONTENT_WIDTH.wide,
  },
  // Listed after innerWide so it wins when a screen passes both.
  innerPage: {
    maxWidth: CONTENT_WIDTH.page,
  },
});
