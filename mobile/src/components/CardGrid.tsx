import { Children, type ReactNode } from "react";
import { StyleSheet, View, type DimensionValue } from "react-native";

import { spacing } from "@/theme";

/**
 * Lays cards out in a row-wrapping grid of `columns` equal columns.
 *
 * The caller decides the column count from `useBreakpoint()` rather than the
 * grid guessing from its own width: a card that is fine two-across on the home
 * screen is cramped two-across inside a narrower sidebar, and only the caller
 * knows which it is in.
 *
 * ## Why the columns are sized this way
 *
 * Cells are `flexGrow: 0` with a percentage basis, and the row is
 * `space-between`. The obvious alternative — a `columnGap` with `flexGrow: 1`
 * so cells share the leftover — has a defect you only see with an odd number
 * of cards: the last row holds one cell, which then grows to the full width.
 * A three-medication list rendered as two normal cards and one stretched
 * across the whole window, which reads as a different kind of row rather than
 * as the end of a list.
 *
 * So the gutter is the leftover percentage instead, and the last row is padded
 * with empty cells to keep its spacing identical to every row above it.
 */
interface CardGridProps {
  children: ReactNode;
  /** 1 keeps the plain stacked column. */
  columns: number;
  /** Vertical space between rows. The horizontal gutter is proportional. */
  gap?: number;
}

/** Width of one gutter, as a percentage of the grid. */
const GUTTER_PERCENT = 2;

export function CardGrid({ children, columns, gap = spacing.md }: CardGridProps) {
  const items = Children.toArray(children).filter(Boolean);

  if (columns <= 1) {
    return <View style={[styles.stack, { gap }]}>{items}</View>;
  }

  const basis = `${(100 - GUTTER_PERCENT * (columns - 1)) / columns}%` as DimensionValue;
  const cell = { flexBasis: basis, maxWidth: basis };

  // Empty cells finishing the last row. They carry no content and so no
  // height, and exist only so `space-between` positions a short final row the
  // same way it positions a full one.
  const fillers = (columns - (items.length % columns)) % columns;

  return (
    <View style={[styles.grid, { rowGap: gap }]}>
      {items.map((item, index) => (
        <View key={index} style={cell}>
          {item}
        </View>
      ))}
      {Array.from({ length: fillers }, (_, index) => (
        <View key={`filler-${index}`} style={cell} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    width: "100%",
  },
  grid: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "stretch",
  },
});
