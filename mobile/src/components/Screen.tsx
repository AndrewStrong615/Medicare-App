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

import { CONTENT_WIDTH, colors, spacing } from "@/theme";

/**
 * Shared page frame: consistent background and padding, keeps content clear of
 * the keyboard, and scrolls when content doesn't fit.
 *
 * Scrolling matters for accessibility as much as for small screens — at large
 * system font sizes these screens overflow even on a big phone, and a
 * non-scrolling View would put the submit button permanently out of reach.
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
   * desktop. A 1140pt line of body text is harder to read than a 660pt one,
   * and this app is read by people who are unwell. Only pass it when the
   * children actually split into columns below that width — the home screen
   * does, above `BREAKPOINT.expanded`.
   */
  page?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  /** Overrides the spacing rhythm of the content column itself. */
  innerStyle?: StyleProp<ViewStyle>;
}

export function Screen({
  children,
  centerContent = false,
  wide = false,
  page = false,
  contentStyle,
  innerStyle,
}: ScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      // iOS slides content up; Android's adjustResize (Expo's default) already
      // handles this, and enabling it there causes double-padding.
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          centerContent && styles.centered,
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
  content: {
    flexGrow: 1,
    padding: spacing.xl,
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
