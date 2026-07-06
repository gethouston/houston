/**
 * Persisted per-user favorite + recent model ids.
 *
 * Both lists live in the general per-user key-value store (`tauriPreferences` →
 * host `getPreference`/`setPreference` → `preferences.json`), which stores
 * STRINGS only, so each list is JSON-encoded under its own key. Mirrors the
 * scalar-preference precedent of `tauriProvider.getLastUsed/setLastUsed`.
 *
 * The list-transform logic lives in `./model-favorites-core` (pure, no I/O) so
 * it is unit-testable; this module is only the read-modify-write layer over
 * preferences. Real engine failures surface as toasts through the `call()`
 * adapter that wraps `tauriPreferences.get/set` — nothing here swallows them.
 */
import {
  DEFAULT_MAX_RECENTS,
  parseIdList,
  pushToFront,
  toggleInList,
} from "./model-favorites-core";
import { tauriPreferences } from "./tauri";

export {
  DEFAULT_MAX_RECENTS,
  parseIdList,
  pushToFront,
  toggleInList,
} from "./model-favorites-core";

/** Preference key holding the JSON-encoded favorite model-id list. */
export const FAVORITE_MODELS_PREF_KEY = "favorite_models";
/** Preference key holding the JSON-encoded recent model-id list. */
export const RECENT_MODELS_PREF_KEY = "recent_models";

/** The user's favorited model ids, or `[]` if none/unset. */
export async function getFavorites(): Promise<string[]> {
  return parseIdList(await tauriPreferences.get(FAVORITE_MODELS_PREF_KEY));
}

/**
 * Toggle `id`'s membership in `current`, persist the result, and return the new
 * list. `current` is the caller-supplied base (the live query-cache value) so
 * concurrent toggles can't each read a stale persisted list and clobber one
 * another — the read side lives with the caller, this only transforms + writes.
 */
export async function toggleFavorite(
  current: readonly string[],
  id: string,
): Promise<string[]> {
  const next = toggleInList(current, id);
  await tauriPreferences.set(FAVORITE_MODELS_PREF_KEY, JSON.stringify(next));
  return next;
}

/** The user's recently-used model ids, newest first, or `[]` if none/unset. */
export async function getRecents(): Promise<string[]> {
  return parseIdList(await tauriPreferences.get(RECENT_MODELS_PREF_KEY));
}

/**
 * Record `id` as the most recently used model against `current`: move it to the
 * front (deduped), cap the list at `max`, persist, and return the new list.
 * `current` is the caller-supplied base (the live query-cache value) — see
 * `toggleFavorite` for why the read side stays with the caller.
 */
export async function pushRecent(
  current: readonly string[],
  id: string,
  max = DEFAULT_MAX_RECENTS,
): Promise<string[]> {
  const next = pushToFront(current, id, max);
  await tauriPreferences.set(RECENT_MODELS_PREF_KEY, JSON.stringify(next));
  return next;
}
