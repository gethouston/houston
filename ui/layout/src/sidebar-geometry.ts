/**
 * The rail's row anatomy, defined ONCE.
 *
 * EVERY interactive line in the sidebar is the same row: the top-level
 * destinations above the list, the band that names the list, each team's
 * header, each team's destination rows, and the "New agent" row that closes
 * it. AI Employees are the one exception, and a deliberate one: a person row
 * (see {@link sidebarPersonRow}) carries a bigger avatar and a second line.
 * The rest differ only in what they point at and how far their glyph is
 * indented. If any of them drifts in height, indent, glyph column or
 * type size, the rail stops reading as one list and starts reading as several
 * stacked ones. So every value lives here and nowhere else, and
 * {@link SidebarRowButton} is the only component that spends them.
 *
 * Six invariants keep every row on the same ladder:
 *
 * 1. **Height is FIXED per anatomy** (`h-7`, 28px; a person row `h-11`, 44px).
 *    No hover, active, focus, badge or missing-role state may change it — a
 *    rail that reflows under the cursor is the single most obvious tell of a
 *    hand-built list.
 * 2. **The paint is a LAYER, the content sits on top of it.** Hover and active
 *    are drawn on the row's own `::before` — an inset, rounded pill (see
 *    {@link sidebarRowFill}) — never on the element that carries the geometry.
 *    That split is the whole reason the pill can be inset without dragging the
 *    glyph column 6px to the right with it: the indent is spent inside a
 *    full-width button that the paint knows nothing about, so the pills form
 *    one clean column and hierarchy stays a matter of indent, never of a ragged
 *    left edge.
 * 3. **Colour is never pinned on the glyph.** A row's icon inherits its label's
 *    colour, so an active row brightens as one object rather than as a label
 *    with a stale grey mark beside it.
 * 4. **ONE weight for the rail's lines.** Every line — nav destination, band,
 *    team header, child row, add row — is set at 510, the notch past
 *    medium that Linear's rails use. Weight is therefore never a variable: not
 *    of depth, not of state, so nothing re-measures or reflows on click, and
 *    hierarchy is carried entirely by indent and colour. See
 *    `font-weight-510` in `@houston-ai/core`'s globals for why 510 is spelled
 *    the way it is. A person row's NAME is the exception: it is set semibold
 *    at the same 13px, because it names someone rather than somewhere.
 * 5. **Two type sizes and no more.** Every row that points at something is
 *    13px; the band that names the list is 12px. See {@link sidebarRowType}.
 * 6. **One horizontal inset for every band and every run of rows.** See
 *    {@link sidebarBandInset}.
 */

export const sidebarClasses = {
  itemsList: "w-0 min-w-full space-y-px pb-2",
} as const;

/**
 * The ONE horizontal inset the rail's contents sit on: every band heading and
 * every run of rows a band names, and nothing else in the rail may add another.
 *
 * It lives here because a heading inset twice reads as a second list: the
 * `<nav>` that holds a band and `SidebarBand`'s own heading would each add
 * `px-2`, hanging that label 8px right of a band rendered from `sidebar.tsx`
 * inside an unpadded wrapper, while every band's child ROWS stayed on 8px.
 * Spending the value from one export is what makes that unrepeatable: a
 * consumer cannot double it without doubling this.
 */
export const sidebarBandInset = "px-2";

/** Every row in the rail is exactly this tall. See invariant 1. */
export const sidebarRowHeight = "h-7";

/**
 * Team marks size themselves at 14px (`glyph`), including inside a colour
 * wrapper. Bare Lucide marks and the Houston logo use the 16px `slot` rule.
 */
export const sidebarMarkSize = {
  glyph: "size-3.5",
  slot: "[&>img]:size-4 [&>svg]:size-4",
} as const;

/**
 * The shared 20px glyph column holds a 16px Lucide mark or a 14px team mark.
 * Team wrappers preserve their own size; bare destination marks inherit the
 * slot rule on both rail layouts.
 */
export const sidebarIconBox = `flex size-5 shrink-0 items-center justify-center ${sidebarMarkSize.slot}`;

/** The glyph column's diameter, for a mark sized off the column rather than
 *  off its contents (a folded team's running ring). */
export const sidebarGlyphDiameter = 20;

/** A running ring clears the mark it circles by 2px a side. */
export const sidebarRingClearance = 4;

/**
 * The person row: an AI Employee in the expanded rail. Its avatar is a real
 * portrait slot (people may give their employees their own pictures), so it is
 * 32px rather than the 20px glyph column, with the name above the role on two
 * lines. The row is 44px so the avatar sits on even 6px padding; an employee
 * with no role keeps the height and centres its name. The text never grows:
 * the name keeps the rail's 13px and gains weight, the role is 12px and muted.
 */
export const sidebarPersonRow = {
  height: "h-11",
  avatarDiameter: 32,
  iconBox: "flex size-8 shrink-0 items-center justify-center",
  /** Avatar edge to text: the portrait fills its box, so this IS the optical
   *  gap, a step wider than a glyph row's because the mark is wider. */
  iconGap: "mr-2",
  name: "text-[13px] leading-5 font-semibold",
  role: "text-xs leading-4 font-normal text-ink-muted",
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

/**
 * A row has TWO horizontal gaps and they want opposite things, which is why
 * there is no single `gap` on the row. One `gap` would set both at once:
 * tightening the icon side drags the trailing side in with it, and the badge
 * and the "..." end up crowding the row's right edge.
 *
 * **`ICON_GAP` — glyph column to label. TIGHT (6px).** What the eye measures is
 * glyph EDGE to first letter, which is this margin PLUS the slack the mark
 * leaves inside the 20px box: a mark that fills it leaves 0, a 16px Lucide
 * mark leaves 2px a side, and a 14px team mark leaves 3px a side. 6px puts the
 * optical distance at 6-9px, Linear's own range; 8px would put it at 8-11px and a label would read as
 * drifting away from its own icon.
 *
 * **`TRAILING_GAP` — label to the badge on its right. COMFORTABLE (8px).** A
 * count or a status dot is a separate object from the name, not part of the
 * phrase, so it needs air the icon does not: the icon and the label are ONE
 * thing being read left to right.
 *
 * Both spent once, here, so a nav destination, a team header, an agent, the add
 * row and the footer row cannot drift into different gaps.
 */
export const sidebarIconGap = "mr-1.5";
export const sidebarTrailingGap = "ml-2";

/**
 * How far the row's last thing stops short of the row's edge — 8px, which is
 * 2px INSIDE the pill ({@link sidebarRowFill} insets the paint by 6px). Two
 * spellings of the same number because they sit on different elements: the
 * button pads its own right edge, and the "..." affordance beside it is a
 * SIBLING and has to carry a margin instead. At 4px both overhung the pill they
 * sit in, which is what made the "..." look jammed against the edge.
 */
export const sidebarRowEndPad = "pr-2";
export const sidebarRowEndMargin = "mr-2";

/**
 * The rail's type ramp: exactly two steps, both of them Linear's.
 *
 * - `item` — 13px, worn by EVERY row that points at something: the top-level
 *   destinations, a team header, a team's destination rows, an agent, the
 *   "new" row. One size, so the rail reads as one list.
 * - `band` — 12px, for the one row that names the list instead of pointing at
 *   anything ("Your teams").
 *
 * Both steps carry the SAME weight (`font-weight-510`, see invariant 4), so
 * the only thing that separates the band from the rows it heads is one step of
 * size and its colour. That is deliberate: a band set apart by weight reads as
 * a heading bolted above a list, and the whole point of this rail is that the
 * band is the list's own first line.
 *
 * Line-heights are set explicitly and both are shorter than the 28px row, so
 * the label sits optically centred in the box and descenders survive the
 * label's `overflow: hidden` truncation (a `leading-none` label clips the tail
 * of a "g").
 */
export const sidebarRowType = {
  item: "text-[13px] leading-5 font-weight-510",
  band: "text-xs leading-4 font-weight-510",
} as const;

/** The 40px top row and 84px host window controls zone reserve space for
 *  native controls while keeping the icon rail centred below them. */
export const sidebarWindowControlsHeight = "h-10";
export const sidebarWindowControlsWidth = "w-[84px]";
export const sidebarCollapsedWidth = "w-[56px]";
export const sidebarExpandedWidth = "w-[220px]";
