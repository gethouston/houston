import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys.ts";

/**
 * Query-key roots that OUTLIVE a space switch: they hold USER-scoped,
 * space-INVARIANT state, not tenant data, so they must NOT be purged on a
 * switch.
 *
 *  - `session` — the identity `Session`. Purging it re-triggers `useSession`'s
 *    fetch, whose `isLoading` re-arms App.tsx's auth-gate splash (a full-screen
 *    unmount), the very blank the in-place switch (HOU-907) exists to remove.
 *  - `onboarding-pending` / `onboarding-completed` — the durable first-run
 *    flags. They gate the onboarding-vs-shell route in App.tsx; flashing them to
 *    loading on a switch flaps that gate (and, on a switch INTO an empty team
 *    space, would momentarily route a completed user back toward onboarding
 *    before the flag refetches). They are the same across every space, so there
 *    is nothing tenant-specific to reset.
 *
 * Capabilities (role) is deliberately NOT here — it is PER-SPACE, so it must
 * refetch under the new space.
 */
const SPACE_INVARIANT_KEY_ROOTS: ReadonlySet<string> = new Set([
  String(queryKeys.session()[0]),
  String(queryKeys.onboardingPending()[0]),
  String(queryKeys.onboardingCompleted(null)[0]),
]);

/**
 * Drop the query cache on a real active-space change (C8 §Active space), EXCEPT
 * the user-scoped, space-invariant keys above.
 *
 * Tenant query keys are NOT org-scoped: the active space is only an
 * `x-houston-org` request header, so team A and team B collide on the same key.
 * `removeQueries` (not `invalidateQueries`) is required — `invalidateQueries`
 * only marks queries stale and refetches ACTIVE observers, leaving every
 * INACTIVE query's data in cache for `gcTime`. A not-currently-mounted view
 * (e.g. an agent board loaded under the prior space) would then serve that prior
 * space's data via stale-while-revalidate on navigation before the refetch
 * resolves — a cross-tenant data flash. The predicate discards inactive-query
 * data too, so every tenant query refetches clean under the new space while the
 * space-invariant user keys are left intact (HOU-907).
 *
 * A no-op when the space did not change (same-space reselect, or every switch on
 * a personal-only host where every id maps to null).
 */
export function resetCacheForSpaceChange(
  queryClient: QueryClient,
  orgChanged: boolean,
): void {
  if (!orgChanged) return;
  queryClient.removeQueries({
    predicate: (query) =>
      !SPACE_INVARIANT_KEY_ROOTS.has(String(query.queryKey[0])),
  });
}
