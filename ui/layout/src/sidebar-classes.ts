export const sidebarClasses = {
  itemsList: "w-0 min-w-full space-y-0.5 pb-2",
  addButton:
    "group flex w-full min-w-0 items-center rounded-lg text-accent-foreground transition-colors duration-100 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
  addButtonInner:
    "flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left text-[13px]",
  addButtonIcon: "size-4 shrink-0 text-muted-foreground",
  addButtonLabel: "min-w-0 flex-1 truncate",
} as const;

export const sidebarItemRowClasses = {
  root: "group flex w-full min-w-0 items-center rounded-lg transition-colors duration-100",
  editInput:
    "min-w-0 flex-1 px-3 py-1.5 text-[13px] bg-background outline-none border border-border rounded-lg focus:border-foreground/30",
  selectButton:
    "flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left text-[13px] cursor-grab active:cursor-grabbing",
  icon: "shrink-0",
  name: "min-w-0 flex-1 truncate",
  actions: "relative mr-1 flex size-7 shrink-0 items-center justify-center",
  trailing:
    "absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-100",
  trailingWithMenu: "group-hover:opacity-0 group-focus-within:opacity-0",
  trailingMenuOpen: "opacity-0",
  menuButton:
    "absolute inset-0 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 pointer-events-none transition-[background-color,color,opacity] hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 data-[state=open]:pointer-events-auto data-[state=open]:opacity-100",
  collapsedTrailing:
    "pointer-events-none absolute -right-1 -top-1 flex scale-75 items-center justify-center",
} as const;

// Mercury-clean group chrome: a quiet uppercase label, hairline chevron, muted
// count, hover-revealed "..." — no dividing lines, hierarchy carried by spacing.
export const sidebarGroupClasses = {
  header:
    "group/gh relative flex w-full min-w-0 items-center gap-1 rounded-md px-1.5 py-1 transition-colors duration-100 hover:bg-accent/40",
  caret:
    "flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/50 transition-colors duration-100 hover:text-muted-foreground focus-visible:outline-none motion-reduce:transition-none cursor-grab active:cursor-grabbing",
  name: "min-w-0 flex-1 truncate text-left text-[12px] font-medium text-muted-foreground cursor-grab active:cursor-grabbing",
  count:
    "shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground/40 transition-opacity duration-100 group-hover/gh:opacity-0",
  menuButton:
    "absolute right-1.5 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 opacity-0 transition-[opacity,background-color,color] duration-100 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:opacity-100 group-hover/gh:opacity-100 data-[state=open]:opacity-100",
  nameInput:
    "min-w-0 flex-1 rounded border border-border bg-background px-1.5 py-0.5 text-xs outline-none focus:border-foreground/30",
} as const;
