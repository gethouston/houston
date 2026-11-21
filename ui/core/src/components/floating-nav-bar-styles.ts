const ITEM_BASE =
  "flex min-h-11 items-center justify-center rounded-full transition-colors active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

export function floatingNavItemClasses(active: boolean): string {
  return active
    ? `${ITEM_BASE} gap-2 bg-tab-active px-4 text-ink`
    : `${ITEM_BASE} min-w-11 text-ink-muted`;
}

export const FLOATING_NAV_PILL_CLASSES =
  "flex h-14 min-w-0 flex-1 items-center justify-around gap-1 rounded-full bg-chip px-1.5 ht-hairline";

export const FLOATING_NAV_ACTION_CLASSES =
  "flex size-14 shrink-0 items-center justify-center rounded-full bg-chip text-ink transition-colors active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ht-hairline";
