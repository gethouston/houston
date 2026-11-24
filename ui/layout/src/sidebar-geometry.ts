export const sidebarClasses = {
  itemsList: "w-0 min-w-full space-y-px pb-2",
  pinnedList: "w-0 min-w-full space-y-px pb-px",
} as const;

/**
 * The ONE horizontal inset the rail's contents sit on: the pinned rows, the
 * scrolling list and the account row at the foot, and nothing else in the
 * rail may add another. Spending the value from one export is what keeps the
 * three on one edge: a consumer cannot double it without doubling this.
 */
export const sidebarRailInset = "px-2";

export const sidebarRowHeight = "h-7";

/**
 * Team marks size themselves at 14px (`glyph`), including inside a colour
 * wrapper. Bare Lucide marks and the Houston logo use the 16px `slot` rule.
 */
export const sidebarMarkSize = {
  glyph: "size-3.5",
  slot: "[&>img]:size-4 [&>svg]:size-4",
} as const;

export const sidebarIconBox = `flex size-5 shrink-0 items-center justify-center ${sidebarMarkSize.slot}`;

/** The glyph column's diameter, for a mark sized off the column rather than
 *  off its contents (a folded team's running ring). */
export const sidebarGlyphDiameter = 20;

/** A running ring clears the mark it circles by 2px a side. */
export const sidebarRingClearance = 4;

/**
 * The person row: an AI Employee in the expanded rail, spaced like a message
 * list rather than a menu. Its avatar is a real portrait slot (people may give
 * their employees their own pictures), 40px, with the name above a line that
 * may run to two. The row is 64px so the avatar sits on even 12px padding and
 * the name plus two 16px lines (52px) fit with air to spare; a row with less
 * to say keeps the height and centres what it has. The text never grows: the
 * name keeps the rail's 13px and gains weight, the line is 12px and muted.
 */
export const sidebarPersonRow = {
  height: "h-16",
  avatarDiameter: 40,
  iconBox: "flex size-10 shrink-0 items-center justify-center",
  iconGap: "mr-2.5",
  name: "text-[13px] leading-5 font-semibold text-ink",
  role: "text-xs leading-4 font-normal text-ink-muted",
  padBlock: "pl-3 pr-3",
  padChild: "pl-8 pr-3",
} as const;

/**
 * An AI Employee on the COLLAPSED icon rail: a 36px square, not a narrower
 * person row. Its avatar is 24px so the avatar AND its running ring (28px,
 * {@link sidebarRingClearance}) sit inside the square with 4px of air a side;
 * the expanded rail's 32px portrait would put the ring on the square's edge.
 * The hover flyout beside it is a full person row and keeps the portrait.
 */
export const sidebarCollapsedItem = {
  square: "size-9",
  avatarDiameter: 24,
} as const;

export const sidebarAddRow = {
  height: "h-10",
} as const;

/**
 * The add row's empty seat: the portrait slot of whichever rail it is on,
 * holding a bare Plus, so the glyph centres on the avatars above it. The Plus
 * is the 16px standard glyph in both.
 */
export const sidebarSeat = {
  expanded: { diameter: sidebarPersonRow.avatarDiameter, glyph: 16 },
  collapsed: { diameter: sidebarCollapsedItem.avatarDiameter, glyph: 16 },
} as const;

export const sidebarIconGap = "mr-1.5";
export const sidebarTrailingGap = "ml-2";

export const sidebarRowEndPad = "pr-2";
export const sidebarRowEndMargin = "mr-2";

/**
 * The rail's row type: 13px at Linear's 510 (invariant 4), worn by every row
 * so the rail reads as one list.
 *
 * Line-heights are set explicitly and both are shorter than the 28px row, so
 * the label sits optically centred in the box and descenders survive the
 * label's `overflow: hidden` truncation (a `leading-none` label clips the tail
 * of a "g").
 */
export const sidebarRowType = {
  item: "text-[13px] leading-5 font-weight-510",
} as const;
