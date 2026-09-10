import { Children, Fragment, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { colors, elevation, radius } from "@/theme";

/**
 * One bordered card holding several `NavCard variant="row"` destinations,
 * separated by hairlines.
 *
 * ## Why a group rather than a stack of cards
 *
 * Four separately bordered cards read as four decisions of equal weight. A
 * group reads as one list you scan — which is what a set of secondary
 * destinations actually is, once the screen has a single primary action above
 * it. It also removes three borders' worth of visual noise from a screen
 * someone opens while unwell.
 *
 * The rules are drawn by this component and not by the rows, so a row can be
 * added, removed or reordered without anyone having to remember which one is
 * last.
 */
export function NavGroup({ children }: { children: ReactNode }) {
  const items = Children.toArray(children).filter(Boolean);

  return (
    <View style={styles.group}>
      {items.map((item, index) => (
        <Fragment key={index}>
          {index > 0 && <View style={styles.divider} />}
          {item}
        </Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    // Keeps the first and last rows' press highlight inside the rounded edge.
    overflow: "hidden",
    ...elevation.sm,
  },
  divider: {
    height: StyleSheet.hairlineWidth > 1 ? StyleSheet.hairlineWidth : 1,
    backgroundColor: colors.divider,
  },
});
