import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useDomain } from "@/hooks/useDomain";
import { CONTENT_WIDTH, colors, meter, spacing, typography } from "@/theme";

/**
 * The band at the top of a destination: a full-bleed field of that
 * destination's colour with its name knocked out of it.
 *
 * ## Why the colour needs area
 *
 * The first version of this design expressed a destination's hue as a 4pt
 * stripe and a 38pt tile, and the result was correct and forgettable — five
 * carefully chosen colours that a person would never actually notice. A
 * colour that only ever appears as a hairline is not an identity, it is a
 * footnote.
 *
 * So the band is the colour at the size of a sign, because that is what it
 * is: the plate over a hospital department door, which is the exact job this
 * element does. It is also what makes the meter legible as a system — the
 * edge running down the page is the band continuing past the corner.
 *
 * ## ⛔ What may not go in it
 *
 * The band is signage: where you are, plus one plain line about the screen or
 * the software (`meta`) — which is where several screens now state what
 * MedHelp will not do, because a refusal printed on the door plate is read and
 * a refusal in small grey type under a card is not. It is never a place for a
 * claim, a number about the person's health, or copy a reviewer has not read.
 * Nothing in it may be tinted or worded by urgency — the hue is the
 * destination's, always, and never a reading of the content. See the fence on
 * `domains` in `theme.ts`.
 */
interface ScreenBandProps {
  title: string;
  /** One quiet line under the title. See the fence above on what may go in it. */
  meta?: string;
  /** Trailing control, e.g. an edit link. Rendered in the band's own ink. */
  action?: ReactNode;
  /** Full page width, to match a `Screen` laid out in columns. */
  page?: boolean;
}

export function ScreenBand({ title, meta, action, page = false }: ScreenBandProps) {
  const domain = useDomain();

  return (
    <View style={[styles.band, { backgroundColor: domain.fill }]}>
      <View style={[styles.inner, page && styles.innerPage]}>
        <View style={styles.row}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          {action}
        </View>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    width: "100%",
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
    // Clears the meter, which runs down the page on top of the band's left
    // edge. Without this the first letter would sit against it.
    paddingLeft: spacing.xl + meter.width,
  },
  inner: {
    width: "100%",
    maxWidth: CONTENT_WIDTH.wide,
    alignSelf: "center",
    gap: 2,
  },
  innerPage: {
    maxWidth: CONTENT_WIDTH.page,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  title: {
    ...typography.band,
    color: colors.textOnAccent,
    flexShrink: 1,
  },
  meta: {
    ...typography.caption,
    maxWidth: 70 * 7,
    // White at 82% rather than a separate token: the band takes five
    // different grounds and no single tint reads correctly on all of them.
    color: "rgba(255,255,255,0.82)",
  },
});
