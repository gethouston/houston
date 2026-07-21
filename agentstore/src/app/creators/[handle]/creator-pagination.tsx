import type { StoreCatalogSort } from "@houston/agentstore-client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { buildCreatorHref } from "@/lib/creator-href";

const LINK_CLASS =
  "inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none";

export interface CreatorPaginationProps {
  handle: string;
  sort: StoreCatalogSort;
  page: number;
  /** Whether another page of results exists after the current one. */
  hasMore: boolean;
}

/**
 * Prev/next pagination for a creator's public agents, rendered as real links
 * (`/@handle?page=`), so results stay crawlable and work without JavaScript.
 */
export function CreatorPagination({
  handle,
  sort,
  page,
  hasMore,
}: CreatorPaginationProps) {
  const hasPrev = page > 1;
  if (!hasPrev && !hasMore) return null;

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-4"
    >
      {hasPrev ? (
        <Link
          href={buildCreatorHref(handle, { sort, page: page - 1 })}
          rel="prev"
          className={LINK_CLASS}
        >
          <ChevronLeft aria-hidden className="size-4" />
          Previous
        </Link>
      ) : (
        <span />
      )}

      <span className="text-sm text-muted-foreground">Page {page}</span>

      {hasMore ? (
        <Link
          href={buildCreatorHref(handle, { sort, page: page + 1 })}
          rel="next"
          className={LINK_CLASS}
        >
          Next
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
