/**
 * URL <-> filter-state helpers for /explore. Pure and framework-light so they can
 * be unit-tested: `parseExploreParams` reads Next's `searchParams`, and
 * `buildExploreHref` produces clean, canonical links for the filter chips, sort
 * toggle, and pagination. Changing any filter resets to page 1 unless the patch
 * explicitly sets a page; default values (recent sort, page 1) are omitted so the
 * URL stays tidy and cache-friendly.
 */

export type ExploreSort = "recent" | "installs";

export interface ExploreParams {
  q?: string;
  category?: string;
  integration?: string;
  sort: ExploreSort;
  page: number;
}

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

export function parseExploreParams(sp: RawParams): ExploreParams {
  const pageRaw = Math.trunc(Number(first(sp.page))) || 1;
  return {
    q: first(sp.q),
    category: first(sp.category),
    integration: first(sp.integration)?.toUpperCase(),
    sort: first(sp.sort) === "installs" ? "installs" : "recent",
    page: pageRaw < 1 ? 1 : pageRaw,
  };
}

/**
 * Build an /explore href by merging `patch` onto `current`. Any filter change
 * resets `page` to 1 unless the patch sets `page` itself. Passing `null` in the
 * patch clears a field (used to toggle a selected chip off).
 */
export function buildExploreHref(
  current: ExploreParams,
  patch: Partial<{
    q: string | null;
    category: string | null;
    integration: string | null;
    sort: ExploreSort;
    page: number;
  }> = {},
): string {
  const changesFilter =
    "q" in patch ||
    "category" in patch ||
    "integration" in patch ||
    "sort" in patch;
  const next: ExploreParams = {
    q: "q" in patch ? (patch.q ?? undefined) : current.q,
    category:
      "category" in patch ? (patch.category ?? undefined) : current.category,
    integration:
      "integration" in patch
        ? (patch.integration ?? undefined)
        : current.integration,
    sort: patch.sort ?? current.sort,
    page: patch.page ?? (changesFilter ? 1 : current.page),
  };

  const qs = new URLSearchParams();
  if (next.q) qs.set("q", next.q);
  if (next.category) qs.set("category", next.category);
  if (next.integration) qs.set("integration", next.integration);
  if (next.sort !== "recent") qs.set("sort", next.sort);
  if (next.page > 1) qs.set("page", String(next.page));

  const query = qs.toString();
  return query ? `/explore?${query}` : "/explore";
}
