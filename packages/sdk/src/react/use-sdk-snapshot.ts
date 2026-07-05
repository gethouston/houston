import { useMemo, useSyncExternalStore } from "react";
import type { HoustonSdk } from "../sdk";

/**
 * The slice of {@link HoustonSdk} a scope binding reads from. Narrowing to the
 * two methods it touches keeps {@link snapshotStoreAdapter} unit-testable
 * against a hand-built store without constructing a whole SDK, while
 * {@link HoustonSdk} still satisfies it structurally at the call site.
 */
export type SnapshotSource = Pick<HoustonSdk, "subscribe" | "getSnapshot">;

/**
 * The `(subscribe, getSnapshot)` pair `useSyncExternalStore` consumes, bound to
 * a single `scope`. `getSnapshot` is reused as the server snapshot: the store
 * returns the same reference until a `publish` replaces it, so React sees a
 * stable value (no tearing, no hydration mismatch) and the initial server
 * render matches the client's first read.
 */
export interface SnapshotStoreAdapter<T> {
  subscribe: (onStoreChange: () => void) => () => void;
  getSnapshot: () => T | undefined;
}

/**
 * Build the external-store adapter that binds `scope` to `source`'s reactive
 * store. Framework-agnostic on purpose: the hook wraps it, tests drive it
 * directly.
 */
export function snapshotStoreAdapter<T>(
  source: SnapshotSource,
  scope: string,
): SnapshotStoreAdapter<T> {
  return {
    // `useSyncExternalStore` hands us a zero-arg `onStoreChange`; the store's
    // subscriber receives the snapshot too, which we intentionally ignore —
    // React re-reads through `getSnapshot`.
    subscribe: (onStoreChange) => source.subscribe(scope, onStoreChange),
    getSnapshot: () => source.getSnapshot(scope) as T | undefined,
  };
}

/**
 * Subscribe a component to a Houston SDK scope snapshot (`"connection"`,
 * `"agents"`, a conversation scope from `conversationScope(…)`, …). Returns
 * the latest snapshot, or `undefined` until one is published.
 *
 * `source` is anything with the SDK's `subscribe`/`getSnapshot` pair — a whole
 * {@link HoustonSdk}, or a bare `ScopeStore` (how the desktop binds the
 * engine-adapter's conversation VM without constructing a full SDK).
 *
 * Referentially stable: the value is whatever the store holds, which only
 * changes reference when a new snapshot is published. SSR-safe: the server
 * render reads the same snapshot via the shared `getSnapshot`, with no
 * subscription.
 *
 * `T` is the caller's asserted snapshot shape. Everything crossing this
 * boundary is plain JSON, so this is a cast, not a validated parse — pass the
 * type the owning module publishes for `scope`.
 */
export function useSdkSnapshot<T>(
  source: SnapshotSource,
  scope: string,
): T | undefined {
  const adapter = useMemo(
    () => snapshotStoreAdapter<T>(source, scope),
    [source, scope],
  );
  return useSyncExternalStore(
    adapter.subscribe,
    adapter.getSnapshot,
    adapter.getSnapshot,
  );
}
