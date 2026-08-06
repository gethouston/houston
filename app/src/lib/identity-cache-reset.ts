// The query-cache half of the identity reset (`identity-reset.ts`), split into
// a dependency-light module (query keys only) so `app/tests` can exercise it
// under node:test without the zustand/engine import chains.

import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys.ts";

/**
 * Query-key roots that OUTLIVE an identity change.
 *
 *  - `session` — the identity `Session | null` cache, the ONLY signal the auth
 *    gates (`HostedEngineGate`, `IdentityKeyedApp`, `App`) re-render on. It must
 *    be purged by VALUE (the sign-out/switch paths write it through
 *    `cacheSession`), never by removing the query: `queryClient.clear()` (and
 *    `removeQueries` without this exemption) destroys the `Query` object while
 *    those mounted observers are still attached to it, and the next
 *    `setQueryData` builds a REPLACEMENT query with zero observers. Observers
 *    only re-bind on a render, the gates have no other render trigger, so the
 *    next sign-in's session write reaches nobody: the app sits on the sign-in
 *    screen until relaunch while the keychain already holds the new account
 *    (PRODUCT-1235). Mirrors `SPACE_INVARIANT_KEY_ROOTS` in `space-cache.ts`.
 *
 * The onboarding roots that the SPACE reset also preserves are deliberately
 * NOT here: they are user-scoped, so an identity change must drop them.
 */
const IDENTITY_INVARIANT_KEY_ROOTS: ReadonlySet<string> = new Set([
  String(queryKeys.session()[0]),
]);

/**
 * Drop every cached query belonging to the outgoing identity — plus the
 * mutation cache — while keeping the `["session"]` query OBJECT (and its
 * observers) alive. The session's stale value is overwritten by the caller's
 * own `cacheSession` write in the same tick, so no cross-identity data
 * survives; what survives is the subscription that lets that write render.
 */
export function resetQueryCacheForIdentityChange(
  queryClient: QueryClient,
): void {
  queryClient.removeQueries({
    predicate: (query) =>
      !IDENTITY_INVARIANT_KEY_ROOTS.has(String(query.queryKey[0])),
  });
  queryClient.getMutationCache().clear();
}
