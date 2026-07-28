export const sidebarClasses = {
  itemsList: "w-0 min-w-full space-y-0.5 pb-2",
} as const;

export const sidebarItemRowClasses = {
  root: "group flex w-full min-w-0 items-center rounded-lg transition-colors duration-100",
  editInput:
    "min-w-0 flex-1 px-3 py-1.5 text-[13px] bg-input outline-none border border-line rounded-lg focus:border-ink/30",
  selectButton:
    "flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left text-[13px] cursor-grab active:cursor-grabbing",
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
export const sidebarGroupClasses = {
  header:
    "group/gh relative flex w-full min-w-0 items-center gap-1 rounded-md px-1.5 py-1 transition-colors duration-100 hover:bg-hover/40",
  caret:
    "flex size-4 shrink-0 items-center justify-center rounded text-ink-muted/50 transition-colors duration-100 hover:text-ink-muted focus-visible:outline-none motion-reduce:transition-none cursor-grab active:cursor-grabbing",
  name: "min-w-0 flex-1 truncate text-left text-[13px] font-medium text-ink-muted cursor-grab active:cursor-grabbing",
  count:
    "shrink-0 text-[10px] font-medium tabular-nums text-ink-muted/40 transition-opacity duration-100 group-hover/gh:opacity-0",
  menuButton:
    "flex size-5 shrink-0 items-center justify-center rounded text-ink-muted/60 transition-[background-color,color] duration-100 hover:bg-hover hover:text-ink focus-visible:outline-none data-[state=open]:text-ink",
  nameInput:
    "min-w-0 flex-1 rounded border border-line bg-input px-1.5 py-0.5 text-xs outline-none focus:border-ink/30",
} as const;
