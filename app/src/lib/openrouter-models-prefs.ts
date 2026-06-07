import {
  OPENROUTER_MODELS_PREF_KEY,
  deserializeOpenRouterModelSlugs,
  normalizeOpenRouterModelSlugs,
  openRouterStarterModelIds,
  serializeOpenRouterModelSlugs,
  parseOpenRouterModelsText,
} from "./openrouter-models";
import { tauriPreferences } from "./tauri";

export async function loadOpenRouterModelSlugs(): Promise<string[]> {
  const raw = await tauriPreferences.get(OPENROUTER_MODELS_PREF_KEY);
  const stored = deserializeOpenRouterModelSlugs(raw);
  return stored ?? [...openRouterStarterModelIds()];
}

export async function saveOpenRouterModelSlugs(slugs: readonly string[]): Promise<void> {
  const normalized = normalizeOpenRouterModelSlugs(slugs);
  await tauriPreferences.set(
    OPENROUTER_MODELS_PREF_KEY,
    serializeOpenRouterModelSlugs(normalized),
  );
}

export async function saveOpenRouterModelsFromText(text: string): Promise<void> {
  const slugs = parseOpenRouterModelsText(text);
  await saveOpenRouterModelSlugs(slugs);
}
