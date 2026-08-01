import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import {
  type HomeCatalogParams,
  homeCatalogHref,
} from "@/lib/home-catalog-params";

const LINK_CLASS =
  "inline-flex items-center gap-1.5 rounded-full border border-line bg-chip px-4 py-2 text-sm font-medium text-chip-text transition-colors hover:bg-hover hover:text-hover-text focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:outline-none";

export function CatalogPagination({
  params,
  hasMore,
}: {
  params: HomeCatalogParams;
  hasMore: boolean;
}) {
  const hasPrevious = params.page > 1;
  if (!hasPrevious && !hasMore) return null;

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-4"
    >
      {hasPrevious ? (
        <Link
          href={homeCatalogHref(params, { page: params.page - 1 })}
          rel="prev"
          className={LINK_CLASS}
        >
          <ChevronLeft aria-hidden className="size-4" />
          Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-ink-muted">Page {params.page}</span>
      {hasMore ? (
        <Link
          href={homeCatalogHref(params, { page: params.page + 1 })}
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
