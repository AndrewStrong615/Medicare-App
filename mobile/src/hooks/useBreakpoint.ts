import { useWindowDimensions } from "react-native";

import { BREAKPOINT } from "@/theme";

/**
 * Which shape the layout should take at the current window width.
 *
 * This exists because the app is one codebase serving a phone and a browser,
 * and the browser was the one being short-changed: every screen was a single
 * column capped at 660pt, so on a laptop the app was a narrow strip of content
 * with empty background either side.
 *
 * The rule is a window measurement, not a platform test. `Platform.OS ===
 * "web"` would be the wrong question twice over — a browser window dragged
 * narrow should get the phone layout, and a tablet should get the wide one.
 *
 * `useWindowDimensions` re-renders on resize and on rotation, so a window
 * dragged across a breakpoint reflows rather than waiting for a reload.
 *
 * - `compact`  — phones and narrow windows. One column, unchanged.
 * - `medium`   — large tablets and half-screen browser windows. Cards may sit
 *                two across; content is still one column of sections.
 * - `expanded` — full-size browser windows. Sections may sit side by side.
 */
export type Breakpoint = "compact" | "medium" | "expanded";

export interface LayoutInfo {
  width: number;
  breakpoint: Breakpoint;
  /** At least two cards fit across. */
  isMedium: boolean;
  /** Whole sections can sit beside each other. */
  isExpanded: boolean;
}

export function useBreakpoint(): LayoutInfo {
  const { width } = useWindowDimensions();

  const isExpanded = width >= BREAKPOINT.expanded;
  const isMedium = width >= BREAKPOINT.medium;

  return {
    width,
    breakpoint: isExpanded ? "expanded" : isMedium ? "medium" : "compact",
    isMedium,
    isExpanded,
  };
}
