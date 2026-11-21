import {
  matchQuery,
  type QueryCacheNotifyEvent,
  type QueryClient,
} from "@tanstack/react-query";
import type { OptimisticPatch } from "./optimistic-core";

const pending = new WeakMap<QueryClient, Set<OptimisticPatch>>();

function subscribe(qc: QueryClient): Set<OptimisticPatch> {
  const set = new Set<OptimisticPatch>();
  pending.set(qc, set);
  let reapplying = false;
  qc.getQueryCache().subscribe((event: QueryCacheNotifyEvent) => {
    if (reapplying || set.size === 0 || event.type !== "updated") return;
    if (event.action.type !== "success") return;
    const { query } = event;
    reapplying = true;
    try {
      for (const patch of set) {
        if (!matchQuery({ queryKey: patch.queryKey }, query)) continue;
        const current = query.state.data;
        const next = patch.apply(current);
        if (next !== current) qc.setQueryData(query.queryKey, next);
      }
    } finally {
      reapplying = false;
    }
  });
  return set;
}

export function holdPatchesAcrossRefetch(
  qc: QueryClient,
  patches: OptimisticPatch[],
): () => void {
  const set = pending.get(qc) ?? subscribe(qc);
  for (const patch of patches) set.add(patch);
  return () => {
    for (const patch of patches) set.delete(patch);
  };
}
