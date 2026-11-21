import type { StoreCatalogSort } from "@houston/agentstore-client";

export interface CreatorView {
  sort: StoreCatalogSort;
  page: number;
}

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
