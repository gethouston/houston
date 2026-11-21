import { useMemo, useSyncExternalStore } from "react";
import type { HoustonSdk } from "../sdk";

export type SnapshotSource = Pick<HoustonSdk, "subscribe" | "getSnapshot">;

export interface SnapshotStoreAdapter<T> {
  subscribe: (onStoreChange: () => void) => () => void;
  getSnapshot: () => T | undefined;
}

export function snapshotStoreAdapter<T>(
  source: SnapshotSource,
  scope: string,
): SnapshotStoreAdapter<T> {
  return {
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
