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
  contentStyle?: StyleProp<ViewStyle>;
  /** Overrides the spacing rhythm of the content column itself. */
  innerStyle?: StyleProp<ViewStyle>;
}

export function Screen({
  children,
  centerContent = false,
  wide = false,
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
        <View style={[styles.inner, wide && styles.innerWide, innerStyle]}>{children}</View>
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
});
