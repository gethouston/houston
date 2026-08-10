import type { ReactNode } from "react";
import { HeaderSearch } from "./header-search";

/**
 * The ONE container every catalog surface's tools cluster renders in — the
 * compact strip form and the stacked body row form with identical alignment
 * and gaps, so the three screens sharing the header grammar cannot drift a
 * few pixels apart. Callers render their own field and trailing tools;
 * `headerSearchFieldClass` is the matching size treatment for the field
 * itself (compact height in the strip, full width in the row).
 */
export function HeaderToolsRow({
  inStrip,
  search,
  children,
}: {
  inStrip: boolean;
  /** The surface's search field, wrapped in the shared {@link HeaderSearch}. */
  search: ReactNode;
  /** Trailing tools: filters, action buttons. */
  children?: ReactNode;
}) {
  return (
    <div
      className={
        inStrip
          ? "flex items-center gap-2"
          : "mb-8 flex flex-wrap items-center gap-2 pt-2"
      }
    >
      <HeaderSearch inStrip={inStrip}>{search}</HeaderSearch>
      {children}
    </div>
  );
}

export function headerSearchFieldClass(inStrip: boolean): string {
  return inStrip ? "[&_input]:h-8" : "w-full";
}
