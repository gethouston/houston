/**
 * Canonical hrefs for a creator's public page and its paginated / sorted views.
 * The pretty `/@handle` URL is the address the middleware rewrites to
 * `/creators/handle`; default values (recent sort, page 1) are omitted so the URL
 * stays tidy and cache-friendly. Pure so it is unit-testable and shared by the
 * sort toggle and the prev/next pagination.
 */
import type { StoreCatalogSort } from "@houston/agentstore-client";

export interface CreatorView {
  sort: StoreCatalogSort;
  page: number;
}

/** Build the `/@handle` href for the given view, omitting default params. */
export function buildCreatorHref(
  handle: string,
  view: Partial<CreatorView> = {},
): string {
  const qs = new URLSearchParams();
  if (view.sort && view.sort !== "recent") qs.set("sort", view.sort);
  if (view.page && view.page > 1) qs.set("page", String(view.page));
  const query = qs.toString();
  return query ? `/@${handle}?${query}` : `/@${handle}`;
}
