export const sidebarClasses = {
  itemsList: "w-0 min-w-full space-y-px pb-2",
  pinnedList: "w-0 min-w-full space-y-px pb-px",
} as const;

export const sidebarRailInset = "px-2";

export const sidebarRowHeight = "h-7";

export const sidebarMarkSize = {
  glyph: "size-3.5",
  slot: "[&>img]:size-4 [&>svg]:size-4",
} as const;

export const sidebarIconBox = `flex size-5 shrink-0 items-center justify-center ${sidebarMarkSize.slot}`;

export const sidebarGlyphDiameter = 20;

export const sidebarRingClearance = 4;

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

export const sidebarCollapsedItem = {
  square: "size-9",
  avatarDiameter: 24,
} as const;

export const sidebarAddRow = {
  height: "h-10",
} as const;

export const sidebarSeat = {
  expanded: { diameter: sidebarPersonRow.avatarDiameter, glyph: 16 },
  collapsed: { diameter: sidebarCollapsedItem.avatarDiameter, glyph: 16 },
} as const;

export const sidebarIconGap = "mr-1.5";
export const sidebarTrailingGap = "ml-2";

export const sidebarRowEndPad = "pr-2";
export const sidebarRowEndMargin = "mr-2";

export const sidebarRowType = {
  item: "text-[13px] leading-5 font-weight-510",
} as const;
