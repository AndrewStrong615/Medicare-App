import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { CONTENT_WIDTH, spacing } from "@/theme";

/**
 * Holds prose to a readable line length inside a full-width screen.
 *
 * A list screen has two kinds of content with opposite needs: the cards want
 * the whole window on a desktop, and the heading, the subtitle and the buttons
 * above them do not — a 1140pt line of body text is harder to read than a
 * 660pt one, and a single button stretched across a desktop window looks like
 * a mistake.
 *
 * So those screens are `page` wide and wrap their top matter in this. On a
 * phone it is a no-op: the screen is already narrower than the cap.
 */
interface TextColumnProps {
  children: ReactNode;
  /** The screen's own spacing rhythm, when it differs from the default. */
  style?: StyleProp<ViewStyle>;
}

export function TextColumn({ children, style }: TextColumnProps) {
  return <View style={[styles.column, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  column: {
    width: "100%",
    maxWidth: CONTENT_WIDTH.wide,
    gap: spacing.lg,
  },
});
