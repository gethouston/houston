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

export const FAVORITE_MODELS_PREF_KEY = "favorite_models";
export const RECENT_MODELS_PREF_KEY = "recent_models";

export async function getFavorites(): Promise<string[]> {
  return parseIdList(await tauriPreferences.get(FAVORITE_MODELS_PREF_KEY));
}

export async function toggleFavorite(
  current: readonly string[],
  id: string,
): Promise<string[]> {
  const next = toggleInList(current, id);
  await tauriPreferences.set(FAVORITE_MODELS_PREF_KEY, JSON.stringify(next));
  return next;
}

export async function getRecents(): Promise<string[]> {
  return parseIdList(await tauriPreferences.get(RECENT_MODELS_PREF_KEY));
}

export async function pushRecent(
  current: readonly string[],
  id: string,
  max = DEFAULT_MAX_RECENTS,
): Promise<string[]> {
  const next = pushToFront(current, id, max);
  await tauriPreferences.set(RECENT_MODELS_PREF_KEY, JSON.stringify(next));
  return next;
}
