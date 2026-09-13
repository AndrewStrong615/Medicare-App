import type { ReactNode } from "react";
import {
  ImageBackground,
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
import {
  CONTENT_WIDTH,
  chart,
  colors,
  meter,
  spacing,
  type DomainName,
} from "@/theme";

/**
 * Shared page frame: the chart-paper ground, consistent padding, clear of the
 * keyboard, scrolling when content doesn't fit.
 *
 * Scrolling matters for accessibility as much as for small screens — at large
 * system font sizes these screens overflow even on a big phone, and a
 * non-scrolling View would put the submit button permanently out of reach.
 *
 * It draws two of the three things that make this app look like itself:
 *
 * - **The ground**, a tile of ruled paper. See `chart` in `theme.ts`.
 * - **The meter**, a measured colour edge down the leading side, saying which
 *   part of the app this is. See `meter`, and `useDomain` for how a screen
 *   declares its colour.
 *
 * The third is `ScreenBand`, passed in as `band` so this component can bleed
 * it to the full width while the content below it stays in a readable column.
 */
interface ScreenProps {
  children: ReactNode;
  /**
   * The destination plate at the top of the page. Rendered outside the
   * content column so it runs edge to edge; pass a `ScreenBand`.
   */
  band?: ReactNode;
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

const GRID = require("../../assets/chart-grid.png");

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
  band,
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
        The ruled ground. A 40pt tile repeated rather than a hundred Views or
        an SVG — it is 132 bytes, it composites as an opaque image, and it
        needs no library this repository has deliberately avoided adding.
      */}
      <ImageBackground
        source={GRID}
        resizeMode="repeat"
        imageStyle={styles.grid}
        style={styles.flex}
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
          contentContainerStyle={[styles.scroll, centerContent && styles.centered]}
          keyboardShouldPersistTaps="handled"
          alwaysBounceVertical={false}
        >
          {band}

          <View
            style={[
              styles.content,
              meterless && styles.contentMeterless,
              band ? styles.contentUnderBand : null,
              { paddingBottom: spacing.xl + insets.bottom },
              contentStyle,
            ]}
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
          </View>
        </ScrollView>
      </ImageBackground>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  grid: {
    // The tile is baked over `colors.background`, so it needs no tint and no
    // opacity — see the note on `chart` in theme.ts.
    width: chart.tile,
    height: chart.tile,
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
  scroll: {
    flexGrow: 1,
  },
  centered: {
    justifyContent: "center",
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
  contentUnderBand: {
    // The band has already paid the top margin, and doubling it leaves the
    // first card floating away from the plate it belongs to.
    paddingTop: spacing.lg,
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
