import { Fragment } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useDomain } from "@/hooks/useDomain";
import { colors, meter, radius, spacing, typography } from "@/theme";

/**
 * The day as a measured vertical axis, with a stop at each time the person
 * set a reminder for and a marker at the current moment.
 *
 * This is the meter (see `theme.ts`) doing its third job. Everywhere else in
 * the app the coloured edge only says *where you are*; here it is an actual
 * scale, and the rows hang off it in the order the day will happen.
 *
 * ## ⛔ Every stop is drawn identically, and that is the important rule
 *
 * The obvious thing to do with a row of dots down a timeline is to fill the
 * ones that have gone by and leave the rest hollow. **Do not.** A filled dot
 * beside a past time reads as *taken*, and MedHelp has no idea whether it
 * was. This app does not keep an adherence record: a time that has passed
 * says "Earlier today", never "missed", and the same reasoning that governs
 * that wording governs this mark.
 *
 * So the axis encodes one thing only — **when** — and the one differentiated
 * mark on it is `now`, which is a fact about the clock rather than about the
 * person.
 *
 * ## It is never the only carrier of anything
 *
 * Each row states its own time, name, dose and standing in words. The axis is
 * a faster second route to the ordering, not the only route: it is hidden
 * from assistive technology, and a reader who cannot see it loses nothing.
 */
export interface AxisStop {
  key: string;
  /** Already formatted for display, e.g. "08:00". */
  time: string;
  title: string;
  detail?: string;
  /** The row's own words for where it stands, e.g. "Earlier today". */
  standing: string;
  /** Draws the row's standing as a chip rather than quiet text. */
  emphasis?: boolean;
}

interface DayAxisProps {
  stops: readonly AxisStop[];
  /** Formatted current time, and how many stops it falls after. */
  now?: { label: string; after: number };
}

export function DayAxis({ stops, now }: DayAxisProps) {
  const domain = useDomain();

  return (
    <View style={styles.axis}>
      {stops.map((stop, index) => (
        <Fragment key={stop.key}>
          {now && now.after === index ? (
            <NowMarker label={now.label} color={domain.ink} />
          ) : null}

          <View style={styles.row}>
            <Text style={styles.time}>{stop.time}</Text>

            <View style={styles.rail} accessibilityElementsHidden>
              <View style={[styles.rule, { backgroundColor: domain.border }]} />
              <View style={[styles.stop, { borderColor: domain.fill }]} />
            </View>

            <View style={styles.body}>
              <Text style={styles.title}>{stop.title}</Text>
              {stop.detail ? <Text style={styles.detail}>{stop.detail}</Text> : null}
            </View>

            {stop.emphasis ? (
              <View style={[styles.chip, { backgroundColor: domain.surface, borderColor: domain.border }]}>
                <Text style={[styles.chipText, { color: domain.ink }]}>{stop.standing}</Text>
              </View>
            ) : (
              <Text style={styles.standing}>{stop.standing}</Text>
            )}
          </View>
        </Fragment>
      ))}

      {now && now.after >= stops.length ? (
        <NowMarker label={now.label} color={domain.ink} />
      ) : null}
    </View>
  );
}

function NowMarker({ label, color }: { label: string; color: string }) {
  return (
    <View style={styles.nowRow}>
      <Text style={[styles.nowTime, { color }]}>{label}</Text>
      <View style={styles.rail} accessibilityElementsHidden>
        <View style={[styles.rule, { backgroundColor: color }]} />
        <View style={[styles.nowDot, { backgroundColor: color }]} />
      </View>
      <View style={styles.nowLineWrap}>
        <View style={[styles.nowLine, { backgroundColor: color }]} />
        <Text style={[styles.nowLabel, { color }]}>now</Text>
      </View>
    </View>
  );
}

const RAIL = meter.axisColumn - 34;

const styles = StyleSheet.create({
  axis: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingRight: spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 60,
  },
  time: {
    ...typography.data,
    color: colors.textPrimary,
    width: 52,
    textAlign: "right",
  },
  rail: {
    width: RAIL,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
  },
  rule: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: meter.axisWidth,
  },
  stop: {
    width: meter.stop,
    height: meter.stop,
    borderRadius: meter.stop / 2,
    borderWidth: 3,
    backgroundColor: colors.surface,
  },
  body: {
    flex: 1,
    paddingVertical: spacing.sm,
  },
  title: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  detail: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  standing: {
    ...typography.caption,
    color: colors.textMuted,
  },
  chip: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  chipText: {
    ...typography.captionStrong,
  },

  nowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 26,
  },
  nowTime: {
    ...typography.captionStrong,
    width: 52,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  nowDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  nowLineWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  nowLine: {
    flex: 1,
    height: 1,
  },
  nowLabel: {
    ...typography.overline,
  },
});
