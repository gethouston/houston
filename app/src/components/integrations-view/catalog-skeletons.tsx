import { CatalogGrid, Skeleton } from "@houston-ai/core";

/**
 * The catalog surfaces' loading language, in ONE place so the page's Installed
 * and Available sections never disagree about what "still loading" looks like.
 *
 * Every placeholder MIRRORS the real layout it stands in for, down to the row
 * padding, the 40px art tile, and the two text lines, so resolving swaps
 * content in without moving anything (no CLS). They are decorative, hence
 * `aria-hidden`: the surfaces announce loading in copy, not through a wall of
 * grey bars.
 */

/** Stable keys for the placeholder rows / sections, sized to fill the fold.
 *  Named rather than index-derived so the list is keyed honestly. */
const ROW_KEYS = ["a", "b", "c", "d", "e", "f"] as const;
const SECTION_KEYS = ["first", "second"] as const;

/** One row placeholder, shaped exactly like a `CatalogRow`. */
function RowSkeleton({ action = false }: { action?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <Skeleton className="size-10 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3 w-36" />
      </div>
      {action && <Skeleton className="size-9 shrink-0 rounded-full" />}
    </div>
  );
}

/** A placeholder for the Installed strip's two-column row grid. */
export function InstalledSkeleton() {
  return (
    <div aria-hidden>
      <CatalogGrid>
        {ROW_KEYS.map((key) => (
          <RowSkeleton key={key} />
        ))}
      </CatalogGrid>
    </div>
  );
}

/**
 * A placeholder for the grouped category catalog: category sections, each a
 * header over a two-column grid of rows carrying the `+` affordance, closed by
 * the `CatalogShowMore` line — the same `space-y-8` / `mb-3` / `mt-1` rhythm
 * `CategoryCatalog` renders, so the real sections land exactly where the
 * placeholders sat. The show-more counterpart matters: the grid stands in for a
 * CAPPED section (`SECTION_PREVIEW_CAP` rows), and every capped section resolves
 * with that expander under it.
 */
export function CatalogSkeleton() {
  return (
    <div aria-hidden className="space-y-8">
      {SECTION_KEYS.map((section) => (
        <section key={section}>
          <Skeleton className="mb-3 h-5 w-40" />
          <CatalogGrid>
            {ROW_KEYS.map((row) => (
              <RowSkeleton key={row} action />
            ))}
          </CatalogGrid>
          <Skeleton className="mt-1 ml-3 h-5 w-36" />
        </section>
      ))}
    </div>
  );
}
