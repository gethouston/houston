export const sidebarClasses = {
  itemsList: "w-0 min-w-full space-y-0.5 pb-2",
} as const;

// The one row geometry the sidebar's two kinds of row share: an agent row's
// select button and a group's destination rows. Padding, gap and type size live
// here once, so a glyph column can never break between the two — that would
// read as two lists stacked, not one.
export const sidebarRowGeometry =
  "flex min-w-0 items-center gap-2 px-3 py-1.5 text-left text-[13px]";

export const sidebarItemRowClasses = {
  root: "group flex w-full min-w-0 items-center rounded-lg transition-colors duration-100",
  editInput:
    "min-w-0 flex-1 px-3 py-1.5 text-[13px] bg-input outline-none border border-line rounded-lg focus:border-ink/30",
  selectButton: `${sidebarRowGeometry} flex-1 cursor-grab active:cursor-grabbing`,
  icon: "shrink-0",
  name: "min-w-0 flex-1 truncate",
  actions: "relative mr-1 flex shrink-0 items-center gap-1",
  trailing: "flex shrink-0 items-center justify-center pointer-events-none",
  menuButton:
    "flex size-7 shrink-0 items-center justify-center rounded-md text-ink-muted/50 transition-[background-color,color] hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus focus-visible:text-ink data-[state=open]:text-ink",
  collapsedTrailing:
    "pointer-events-none absolute -right-1 -top-1 flex scale-75 items-center justify-center",
} as const;

// Mercury-clean group chrome: a quiet uppercase label, hairline chevron, muted
// count, and quiet always-visible "..." — no dividing lines, hierarchy carried
// by spacing.
//
// The default block's header is the SAME line minus every affordance it does
// not have (no fold, no rename, no menu), so each of those three pieces is one
// base plus the affordance a real group header adds on top. One definition, two
// families — they can never drift apart.
const groupHeaderBase =
  "relative flex w-full min-w-0 items-center gap-1 rounded-md px-1.5 py-1";
const groupNameBase =
  "min-w-0 flex-1 truncate text-left text-[13px] font-medium text-ink-muted";
const groupCountBase =
  "shrink-0 text-[10px] font-medium tabular-nums text-ink-muted/40";

export const sidebarGroupClasses = {
  header: `group/gh ${groupHeaderBase} transition-colors duration-100 hover:bg-hover/40`,
  caret:
    "flex size-4 shrink-0 items-center justify-center rounded text-ink-muted/50 transition-colors duration-100 hover:text-ink-muted focus-visible:outline-none motion-reduce:transition-none cursor-grab active:cursor-grabbing",
  name: `${groupNameBase} cursor-grab active:cursor-grabbing`,
  count: `${groupCountBase} transition-opacity duration-100 group-hover/gh:opacity-0`,
  menuButton:
    "flex size-5 shrink-0 items-center justify-center rounded text-ink-muted/60 transition-[background-color,color] duration-100 hover:bg-hover hover:text-ink focus-visible:outline-none data-[state=open]:text-ink",
  nameInput:
    "min-w-0 flex-1 rounded border border-line bg-input px-1.5 py-0.5 text-xs outline-none focus:border-ink/30",
  // The default block's header: no hover fill, no caret, no menu. The caret
  // spacer keeps its name on the same optical column as every group name.
  staticHeader: groupHeaderBase,
  caretSpacer: "size-4 shrink-0",
  staticName: groupNameBase,
  staticCount: groupCountBase,
} as const;

// Destination rows inside a group (Mission Control, Team Settings, ...). Same
// geometry as an item row's select button so glyphs and labels line up in one
// column whichever kind of row they belong to.
export const sidebarSectionRowClasses = {
  root: `${sidebarRowGeometry} w-full rounded-lg transition-colors duration-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus`,
  // A 20px box, the width an agent row's avatar occupies, so the two kinds of
  // row share one glyph column and one label column. The glyph inside is the
  // standard 16px. Colour is inherited from the row, never pinned here: a
  // selected row's glyph must brighten with its label.
  icon: "flex size-5 shrink-0 items-center justify-center",
  label: "min-w-0 flex-1 truncate",
} as const;
