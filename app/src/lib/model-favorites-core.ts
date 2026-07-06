/**
 * Pure list transforms behind the persisted favorite / recent model lists.
 *
 * These are split out from `model-favorites.ts` (which imports `./tauri`, and so
 * cannot be loaded by the node test runner) so the membership + recency logic is
 * unit-testable without mocking preferences. No I/O, no imports.
 */

/** Default cap on how many recent model ids are retained. */
export const DEFAULT_MAX_RECENTS = 4;

/**
 * Normalize a raw preference value into a string-id list.
 *
 * Tolerates the persisted-value shapes a corrupt or never-written preference can
 * take — `null` / `""` (unset) and non-array / non-string JSON (hand-edited or
 * stale) — collapsing all of them to `[]`. This is persisted-data normalization,
 * NOT swallowing an operational error: the underlying `tauriPreferences.get`
 * still surfaces real engine failures (401/network) as a toast via `call()`.
 */
export function parseIdList(raw: string | null): string[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((entry): entry is string => typeof entry === "string");
}

/** Add `id` if absent, remove it if present. Order of the rest is preserved. */
export function toggleInList(list: readonly string[], id: string): string[] {
  return list.includes(id)
    ? list.filter((entry) => entry !== id)
    : [...list, id];
}

/**
 * Move `id` to the front (deduping any existing occurrence) and cap the result
 * at `max`. Used for the most-recently-used list, so the newest pick is first.
 */
export function pushToFront(
  list: readonly string[],
  id: string,
  max = DEFAULT_MAX_RECENTS,
): string[] {
  const deduped = [id, ...list.filter((entry) => entry !== id)];
  return deduped.slice(0, Math.max(0, max));
}
