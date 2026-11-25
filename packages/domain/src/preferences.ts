import { withDocLock } from "./doc-lock";
import { loadJson, saveJson, type TextStore } from "./store";

export type Preferences = Record<string, string | null>;

// WHY: Locally a real folder beside workspaces; anything listing workspaces must skip it. ADR-0084
export const PREFERENCES_NAMESPACE = "ws";

export const prefDocKey = (workspaceId: string) =>
  `${PREFERENCES_NAMESPACE}/${workspaceId}/preferences.json`;

export async function loadPreferences(
  store: TextStore,
  workspaceId: string,
): Promise<Preferences> {
  const prefs = await loadJson<unknown>(store, prefDocKey(workspaceId), {});
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

export interface PreferenceUpdate {
  previous: string | null;
  preferences: Preferences;
}

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

export async function setPreference(
  store: TextStore,
  workspaceId: string,
  key: string,
  value: string | null,
): Promise<Preferences> {
  return (await updatePreference(store, workspaceId, key, () => value))
    .preferences;
}

export async function createPreference(
  store: TextStore,
  workspaceId: string,
  key: string,
  value: string | null,
): Promise<{ created: boolean; value: string | null }> {
  const held = (current: string | null) =>
    current !== null && current.trim() !== "";
  const { previous } = await updatePreference(
    store,
    workspaceId,
    key,
    (current) => (held(current) ? current : value),
  );
  return previous !== null && held(previous)
    ? { created: false, value: previous }
    : { created: true, value };
}
