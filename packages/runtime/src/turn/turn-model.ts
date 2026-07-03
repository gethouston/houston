import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { providerDefaultModel, safeGetModel } from "../ai/providers";

type Settings = { activeProvider?: string; models?: Record<string, string> };

/**
 * Model for a cloud per-turn run. Precedence: an explicit per-turn override (a
 * routine's pinned model) beats the agent's settings.json, which beats the env
 * default. A bad PIN surfaces as the turn's error; a stale SAVED model id (a
 * legacy id the migration didn't reach, e.g. a hand-edited settings.json)
 * falls back to the provider's default with a logged diagnostic (safeGetModel)
 * instead of hard-failing the turn.
 */
export function resolveTurnModel(
  dataDir: string,
  provider: string,
  override?: string | null,
) {
  let settings: Settings = {};
  const f = join(dataDir, "settings.json");
  if (existsSync(f)) {
    try {
      settings = JSON.parse(readFileSync(f, "utf8")) as Settings;
    } catch {
      settings = {};
    }
  }
  const modelId =
    override || settings.models?.[provider] || providerDefaultModel(provider);
  return safeGetModel(provider, modelId, !!override);
}
