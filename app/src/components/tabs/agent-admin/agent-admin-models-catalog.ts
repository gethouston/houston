import { PROVIDERS } from "../../../lib/providers.ts";

export interface ModelCatalogEntry {
  id: string;
  label: string;
}

/**
 * The flat, deduped model catalog a manager restricts an agent to. Built from
 * every provider's model list ({@link PROVIDERS}), keyed by model id. The
 * `allowedModels` ceiling is a set of model-id strings the gateway matches a
 * member's chosen `model` against, so one entry per id is correct even though a
 * label can repeat across providers (e.g. a native and a Copilot Sonnet carry
 * distinct ids). First label wins; sorted A-Z by label for a stable picker.
 */
export function modelCatalog(): ModelCatalogEntry[] {
  const seen = new Map<string, string>();
  for (const provider of PROVIDERS) {
    for (const model of provider.models) {
      if (!seen.has(model.id)) seen.set(model.id, model.label);
    }
  }
  return [...seen.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
}
