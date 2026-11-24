/**
 * Where a rail part is drawn. `rail` is the sidebar itself: 36px rows at the
 * rail's 13px, on the rail inset. `sheet` is a phone card that lists the same
 * destinations (Houston's More card): the card's own rows, so every row in
 * it starts on one left edge at one type size, whichever component drew it.
 */
export type SidebarSurface = "rail" | "sheet";

/**
 * A sheet row: at least 48px tall (a primary touch target), full width, its
 * content 16px in from the card's edge, its words 16px. Exported so the host's
 * own rows in the same card wear the identical string rather than a copy of it.
 * Press feedback is a slight scale, hover and an open menu the `hover` wash.
 */
export const sidebarSheetRowClasses =
  "flex min-h-12 w-full min-w-0 items-center gap-3 px-4 text-left text-base text-ink transition-colors active:scale-[0.98] hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset data-[state=open]:bg-hover";
