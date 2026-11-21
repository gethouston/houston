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

export const sidebarHeaderControlClasses =
  "flex size-7 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus data-[state=open]:bg-hover data-[state=open]:text-ink";

export const sidebarBlockGap = "mt-3";

export const sidebarRowNeighbour =
  "[&:has(+*:hover)_[data-person-text]]:border-transparent [&:has(+*_[aria-current=page])_[data-person-text]]:border-transparent";
export const sidebarListEnd =
  "[&>[data-sidebar-row]:last-of-type_[data-person-text]]:border-transparent";
export const sidebarPinnedNeighbour =
  "[&:has(+*_[data-sidebar-root-list]>[data-sidebar-row]:first-of-type:hover)_[data-sidebar-row]:last-child_[data-person-text]]:border-transparent [&:has(+*_[data-sidebar-root-list]>[data-sidebar-row]:first-of-type_[aria-current=page])_[data-sidebar-row]:last-child_[data-person-text]]:border-transparent [&:not(:has(+*_[data-sidebar-row]))_[data-sidebar-row]:last-child_[data-person-text]]:border-transparent";

export const sidebarRowAffordanceClasses = `relative ${sidebarRowEndMargin} flex size-6 shrink-0 items-center justify-center rounded-md text-ink-muted/60 transition-[background-color,color] duration-100 hover:bg-hover hover:text-ink focus-visible:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus data-[state=open]:bg-hover data-[state=open]:text-ink`;

export const sidebarCollapsedItemClasses = {
  trailing:
    "pointer-events-none absolute top-0 -right-1 flex scale-75 items-center justify-center",
} as const;
