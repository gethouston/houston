import { loadJson, saveJson, type TextStore } from "./store";

/**
 * Per-workspace key-value preferences (timezone, locale, legal_acceptance, …).
 * Stored as one doc ABOVE the agent prefixes — `ws/<workspaceId>/preferences.json`
 * — so it survives agent deletion. In cloud personal-tier (one workspace per
 * user) this is effectively per-user; locally it is per-workspace, matching the
 * desktop's per-workspace locale override.
 */
export type Preferences = Record<string, string | null>;

export const prefDocKey = (workspaceId: string) => `ws/${workspaceId}/preferences.json`;

export async function loadPreferences(store: TextStore, workspaceId: string): Promise<Preferences> {
  const prefs = await loadJson<unknown>(store, prefDocKey(workspaceId), {});
  // A non-object doc (corrupt/hand-edited) reads as empty rather than crashing
  // the boot-path gates that depend on locale/legal_acceptance.
  return prefs && typeof prefs === "object" && !Array.isArray(prefs) ? (prefs as Preferences) : {};
}

export async function getPreference(
  store: TextStore,
  workspaceId: string,
  key: string,
): Promise<string | null> {
  return (await loadPreferences(store, workspaceId))[key] ?? null;
}

/** Set or clear (null) one key; returns the merged preferences. */
export async function setPreference(
  store: TextStore,
  workspaceId: string,
  key: string,
  value: string | null,
): Promise<Preferences> {
  const prefs = await loadPreferences(store, workspaceId);
  const next = { ...prefs, [key]: value };
  await saveJson(store, prefDocKey(workspaceId), next);
  return next;
}
