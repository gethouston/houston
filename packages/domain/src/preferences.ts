import { withDocLock } from "./doc-lock";
import { loadJson, saveJson, type TextStore } from "./store";

/**
 * Per-workspace key-value preferences (timezone, locale, legal_acceptance, …).
 * Stored as one doc ABOVE the agent prefixes — `ws/<workspaceId>/preferences.json`
 * — so it survives agent deletion. In cloud personal-tier (one workspace per
 * user) this is effectively per-user; locally it is per-workspace, matching the
 * desktop's per-workspace locale override.
 */
export type Preferences = Record<string, string | null>;

export const prefDocKey = (workspaceId: string) =>
  `ws/${workspaceId}/preferences.json`;

export async function loadPreferences(
  store: TextStore,
  workspaceId: string,
): Promise<Preferences> {
  const prefs = await loadJson<unknown>(store, prefDocKey(workspaceId), {});
  // A non-object doc (corrupt/hand-edited) reads as empty rather than crashing
  // the boot-path gates that depend on locale/legal_acceptance.
  return prefs && typeof prefs === "object" && !Array.isArray(prefs)
    ? (prefs as Preferences)
    : {};
}

export async function getPreference(
  store: TextStore,
  workspaceId: string,
  key: string,
): Promise<string | null> {
  return (await loadPreferences(store, workspaceId))[key] ?? null;
}

/** One key's value before an update, plus the whole document after it. */
export interface PreferenceUpdate {
  previous: string | null;
  preferences: Preferences;
}

/**
 * Atomically read-modify-write ONE key of the preferences document.
 *
 * The whole doc is a single JSON blob, so every write is a load → merge → save
 * and two overlapping writers of DIFFERENT keys would each save over the
 * other's base: the loser's key silently disappears. Preferences are written
 * concurrently all the time (the locale PATCH, the sidebar layout, the agent
 * colour map a template install rewrites per agent), so the lock lives HERE,
 * around the read as well as the write, rather than at each caller — a caller
 * that forgot it would reintroduce the loss.
 */
export function updatePreference(
  store: TextStore,
  workspaceId: string,
  key: string,
  edit: (current: string | null) => string | null,
): Promise<PreferenceUpdate> {
  return withDocLock(prefDocKey(workspaceId), async () => {
    const prefs = await loadPreferences(store, workspaceId);
    const previous = prefs[key] ?? null;
    const preferences = { ...prefs, [key]: edit(previous) };
    await saveJson(store, prefDocKey(workspaceId), preferences);
    return { previous, preferences };
  });
}

/** Set or clear (null) one key; returns the merged preferences. */
export async function setPreference(
  store: TextStore,
  workspaceId: string,
  key: string,
  value: string | null,
): Promise<Preferences> {
  return (await updatePreference(store, workspaceId, key, () => value))
    .preferences;
}
