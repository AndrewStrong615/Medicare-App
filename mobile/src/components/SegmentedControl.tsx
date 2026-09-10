import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, elevation, radius, spacing, typography } from "@/theme";

/**
 * Two or three views of the same set of things.
 *
 * Used where the app previously had separate top-level destinations for one
 * set of objects: a medication and the times it is taken are the same record
 * seen two ways, and a reminder has no meaning apart from the medication it
 * belongs to. Splitting those across a hub made the user navigate between
 * them as if they were different features.
 *
 * ⛔ This is for alternative views, never for a filter that hides something
 * the user needs to see. A segment that concealed an overdue refill or an
 * unarranged appointment would make the app quieter about the thing it is
 * least entitled to be quiet about.
 */
export interface Segment {
  key: string;
  label: string;
  /** Spoken after the label. Say where this goes, not what it looks like. */
  hint?: string;
}

interface SegmentedControlProps {
  segments: Segment[];
  selected: string;
  onSelect: (key: string) => void;
}

type HoverProps = { onHoverIn?: () => void; onHoverOut?: () => void };

export function SegmentedControl({
  segments,
  selected,
  onSelect,
}: SegmentedControlProps) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {segments.map((segment) => (
        <SegmentButton
          key={segment.key}
          segment={segment}
          active={segment.key === selected}
          onPress={() => onSelect(segment.key)}
        />
      ))}
    </View>
  );
}

function SegmentButton({
  segment,
  active,
  onPress,
}: {
  segment: Segment;
  active: boolean;
  onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const hoverProps: HoverProps = {
    onHoverIn: () => setHovered(true),
    onHoverOut: () => setHovered(false),
  };

  return (
    <Pressable
      {...hoverProps}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={segment.label}
      accessibilityHint={segment.hint}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.segment,
        active && styles.segmentActive,
        !active && hovered && styles.segmentHovered,
        !active && pressed && styles.segmentPressed,
      ]}
    >
      <Text
        style={[styles.label, active && styles.labelActive]}
        numberOfLines={1}
      >
        {segment.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    gap: spacing.xs,
    padding: spacing.xs,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
  },
  segment: {
    flex: 1,
    // 44 inside a 4pt-padded track is a 52pt row, so the control as a whole
    // clears the 48 in `MIN_TAP_TARGET` while the selected pill still reads
    // as an inset rather than filling the frame.
    minHeight: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  segmentActive: {
    backgroundColor: colors.surface,
    borderColor: colors.accentBorder,
    ...elevation.sm,
  },
  segmentHovered: {
    backgroundColor: colors.background,
  },
  segmentPressed: {
    backgroundColor: colors.background,
  },
  label: {
    ...typography.captionStrong,
    color: colors.textSecondary,
  },
  labelActive: {
    color: colors.accent,
  },
});
