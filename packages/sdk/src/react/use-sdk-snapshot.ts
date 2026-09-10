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
 *
 * **One React notification per task, not per publish.** `useSyncExternalStore`
 * answers every `onStoreChange` with a SYNC-lane render, and React 19 counts
 * consecutive sync commits that leave other work pending (a passive effect's
 * setState is default-lane work) as one nested-update chain — it never resets
 * until a task boundary lets that work commit. A turn stream delivers frames
 * with only microtask gaps (`await onEvent(frame)` per SSE frame, and a
 * reconnect replay hands over dozens in one chunk), so notifying per publish
 * runs 50+ sync commits inside one task and React throws "Maximum update
 * depth exceeded" (#185) INTO the publisher — failing the turn. Deferring the
 * notification to a macrotask coalesces the burst into one render; a
 * microtask would not (it interleaves with the stream's own microtasks).
 * `getSnapshot` stays synchronous, so any render in between already reads the
 * latest value — the deferral only delays React learning it changed.
 */
export function snapshotStoreAdapter<T>(
  source: SnapshotSource,
  scope: string,
): SnapshotStoreAdapter<T> {
  return {
    // `useSyncExternalStore` hands us a zero-arg `onStoreChange`; the store's
    // subscriber receives the snapshot too, which we intentionally ignore —
    // React re-reads through `getSnapshot`.
    subscribe: (onStoreChange) => {
      let scheduled = false;
      let live = true;
      const unsubscribe = source.subscribe(scope, () => {
        if (scheduled) return;
        scheduled = true;
        setTimeout(() => {
          scheduled = false;
          if (live) onStoreChange();
        }, 0);
      });
      return () => {
        live = false;
        unsubscribe();
      };
    },
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
