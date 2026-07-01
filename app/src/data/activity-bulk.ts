/**
 * Pure helpers for mutations over the activity list.
 *
 * Kept free of any engine / Tauri imports (only erased `import type`s) so
 * the read-mutate-write logic stays unit-testable in isolation. `data/activity.ts`
 * composes these with `readAgentJson` / `writeAgentJson`.
 */

import type { Activity, ActivityUpdate } from "./activity";

/** Apply `patch` to every item whose id is in `ids`, stamping `updated_at`. */
export function applyBulkPatch(
  items: Activity[],
  ids: ReadonlySet<string>,
  patch: ActivityUpdate,
  timestamp: string,
): Activity[] {
  return items.map((item) =>
    ids.has(item.id) ? { ...item, ...patch, updated_at: timestamp } : item,
  );
}

/** Drop one item by id. Missing ids are an idempotent no-op. */
export function applyRemove(
  items: Activity[],
  id: string,
): { items: Activity[]; removed: boolean } {
  const idx = items.findIndex((item) => item.id === id);
  if (idx === -1) return { items, removed: false };
  return {
    items: [...items.slice(0, idx), ...items.slice(idx + 1)],
    removed: true,
  };
}

/** Drop every item whose id is in `ids`. */
export function applyBulkRemove(
  items: Activity[],
  ids: ReadonlySet<string>,
): Activity[] {
  return items.filter((item) => !ids.has(item.id));
}
