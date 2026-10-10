/**
 * The org chart's connector lines, drawn by CSS on the tree's own lists so
 * they follow the layout rather than being measured. Each value is a
 * spacing step chosen so a line lands on a disc's centre:
 *
 * - the root disc is `size-10` (centre 5), a person or a people-row AI
 *   Employee `size-9` (centre 4.5), an AI Employee under a person `size-8`
 *   (centre 4);
 * - an elbow's `top` is the item's top padding plus its disc's centre.
 *
 * Phone (unprefixed): an indented outline. Each list hangs off its parent's
 * disc centre, a spine runs down its left edge (stopping at the last item's
 * elbow) and an elbow reaches each item.
 *
 * Desktop (`md:`): the people row turns into a comb. A stem drops from the
 * root, a bus runs from the first column's axis to the last one's (100% of
 * the row less one column, `w-56` = 14rem), and each column drops from the
 * bus to its face. The row is exactly as wide as its columns (`w-max`), or
 * the bus would run past the last person whenever the row is stretched. The AI Employees under a person keep the outline.
 */

const LINE = "before:bg-line after:bg-line";

/** The people row: the phone outline's first level, the desktop comb. */
export const BRANCH_LIST = [
  "relative ml-5 flex flex-col",
  "md:mt-4 md:ml-0.5 md:w-max md:flex-row md:gap-8",
  "md:before:absolute md:before:-top-4 md:before:left-4.5 md:before:h-4 md:before:w-px",
  "md:after:absolute md:after:top-0 md:after:left-4.5 md:after:h-px md:after:w-[calc(100%-14rem)]",
  LINE,
].join(" ");

/** One person (or people-row AI Employee) in that row. */
export const BRANCH_ITEM = [
  "relative min-w-0 pt-4 pl-6",
  "before:absolute before:top-0 before:left-0 before:h-full before:w-px last:before:h-8.5",
  "after:absolute after:top-8.5 after:left-0 after:h-px after:w-5",
  "md:w-56 md:shrink-0 md:pt-6 md:pl-0",
  "md:before:left-4.5 md:before:h-6 md:last:before:h-6 md:after:hidden",
  LINE,
].join(" ");

/** The AI Employees under one person, hung off the person's face. */
export const LEAF_LIST = "relative ml-4.5 flex flex-col";

export const LEAF_ITEM = [
  "relative min-w-0 pt-3 pl-5",
  "before:absolute before:top-0 before:left-0 before:h-full before:w-px last:before:h-7",
  "after:absolute after:top-7 after:left-0 after:h-px after:w-4",
  LINE,
].join(" ");
