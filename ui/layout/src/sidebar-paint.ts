import {
  sidebarIconBox,
  sidebarIconGap,
  sidebarPersonRow,
  sidebarRowEndMargin,
  sidebarRowEndPad,
  sidebarRowHeight,
  sidebarTrailingGap,
} from "./sidebar-geometry";

export const sidebarRowFill =
  "before:pointer-events-none before:absolute before:inset-y-0 before:right-1.5 before:left-1.5 before:rounded-lg before:transition-colors before:duration-100 before:content-[''] has-[>button:first-child:focus-visible]:before:ring-2 has-[>button:first-child:focus-visible]:before:ring-focus";

export const sidebarRowState = {
  active: "before:bg-sidebar-active text-ink",
  hover: "hover:before:bg-sidebar-hover",
  restText: "text-hover-text",
} as const;

export const sidebarRowButtonClasses = {
  root: `group/row relative ${sidebarRowHeight} flex w-full min-w-0 items-center ${sidebarRowFill}`,
  button: `relative flex ${sidebarRowHeight} min-w-0 flex-1 items-center ${sidebarRowEndPad} text-left focus-visible:outline-none`,
  depthBlock: "pl-3",
  depthChild: "pl-8",
  personHeight: sidebarPersonRow.height,
  personIcon: `${sidebarPersonRow.iconBox} ${sidebarPersonRow.iconGap}`,
  personText:
    "flex min-w-0 flex-1 flex-col justify-center self-stretch border-b border-line [font-variation-settings:normal] group-hover/row:border-transparent",
  personTextBare: "border-transparent",
  personFill: "before:inset-x-0",
  personPadBlock: sidebarPersonRow.padBlock,
  personPadChild: sidebarPersonRow.padChild,
  personLine: "flex min-w-0 items-start gap-2",
  personName: `min-w-0 truncate ${sidebarPersonRow.name}`,
  personRole: `min-w-0 flex-1 line-clamp-2 break-words ${sidebarPersonRow.role}`,
  personBadge: "flex shrink-0 items-center",
  draggable: "cursor-grab active:cursor-grabbing",
  icon: `${sidebarIconBox} ${sidebarIconGap}`,
  labelGroup: "flex min-w-0 items-center gap-1",
  label: "min-w-0 truncate",
  spacer: "min-w-0 flex-1",
  trailing: `${sidebarTrailingGap} flex shrink-0 items-center`,
  caret:
    "size-4 shrink-0 fill-current text-ink-muted transition-transform duration-150 group-hover/row:text-ink motion-reduce:transition-none",
} as const;

/**
 * A control on the rail's top line: the collapse toggle and the host's header
 * actions beside it (search, create). One class, so the line reads as one set
 * of buttons rather than a toggle with lookalikes parked next to it.
 */
export const sidebarHeaderControlClasses =
  "flex size-7 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus data-[state=open]:bg-hover data-[state=open]:text-ink";

export const sidebarBlockGap = "mt-3";

export const sidebarRowNeighbour =
  "[&:has(+*:hover)_[data-person-text]]:border-transparent [&:has(+*_[aria-current=page])_[data-person-text]]:border-transparent";
export const sidebarListEnd =
  "[&>[data-sidebar-row]:last-of-type_[data-person-text]]:border-transparent";
export const sidebarPinnedNeighbour =
  "[&:has(+*_[data-sidebar-root-list]>[data-sidebar-row]:first-of-type:hover)_[data-sidebar-row]:last-child_[data-person-text]]:border-transparent [&:has(+*_[data-sidebar-root-list]>[data-sidebar-row]:first-of-type_[aria-current=page])_[data-sidebar-row]:last-child_[data-person-text]]:border-transparent [&:not(:has(+*_[data-sidebar-row]))_[data-sidebar-row]:last-child_[data-person-text]]:border-transparent";

/**
 * A row's trailing control: the "..." menu on a group. A SIBLING of the row
 * button, never a child, because a button may not nest inside a button.
 *
 * Always rendered, muted at rest, strengthening on hover / focus / open.
 * Houston forbids hover-GATED affordances: a control that only exists under the
 * cursor is unreachable by touch and invisible to anyone scanning the rail.
 *
 * `relative` for one reason only: the row's pill is an absolutely positioned
 * `::before`, and a static sibling would paint underneath it.
 *
 * Exported from the package because `app/` mounts its own menus into a row's
 * affordance slot, and a hand-copied class string is how two triggers on the
 * same row end up looking like two different controls.
 */
export const sidebarRowAffordanceClasses = `relative ${sidebarRowEndMargin} flex size-6 shrink-0 items-center justify-center rounded-md text-ink-muted/60 transition-[background-color,color] duration-100 hover:bg-hover hover:text-ink focus-visible:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus data-[state=open]:bg-hover data-[state=open]:text-ink`;

export const sidebarCollapsedItemClasses = {
  trailing:
    "pointer-events-none absolute top-0 -right-1 flex scale-75 items-center justify-center",
} as const;
