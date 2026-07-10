import type { QueryClient } from "@tanstack/react-query";

/**
 * Drop the whole query cache on a real active-space change (C8 §Active space).
 *
 * Query keys are NOT org-scoped: the active space is only an `x-houston-org`
 * request header, so team A and team B collide on the same key. `removeQueries`
 * (not `invalidateQueries`) is required — `invalidateQueries` only marks queries
 * stale and refetches ACTIVE observers, leaving every INACTIVE query's data in
 * cache for `gcTime`. A not-currently-mounted view (e.g. an agent board loaded
 * under the prior space) would then serve that prior space's data via
 * stale-while-revalidate on navigation before the refetch resolves — a
 * cross-tenant data flash. `removeQueries` discards inactive-query data too, so
 * everything refetches clean under the new space.
 *
 * A no-op when the space did not change (same-space reselect, or every switch on
 * a personal-only host where every id maps to null).
 */
export function resetCacheForSpaceChange(
  queryClient: QueryClient,
  orgChanged: boolean,
): void {
  if (orgChanged) queryClient.removeQueries();
}
