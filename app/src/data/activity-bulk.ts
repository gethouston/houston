/**
 * Pure helpers for bulk mutations over the activity list.
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

/** Drop every item whose id is in `ids`. */
export function applyBulkRemove(
  items: Activity[],
  ids: ReadonlySet<string>,
): Activity[] {
  return items.filter((item) => !ids.has(item.id));
}

/**
 * Drop the single item with `id`. Returns the same-length list (an idempotent
 * no-op) when `id` isn't present, so `data/activity.ts` `remove()` can skip the
 * write and treat "already gone" as success rather than throwing.
 */
export function applyRemove(items: Activity[], id: string): Activity[] {
  return items.filter((item) => item.id !== id);
}
