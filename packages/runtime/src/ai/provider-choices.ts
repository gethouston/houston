import type { ProviderOption } from "@houston/domain";
import { listProviders } from "./providers";

export function connectedProviderChoices(): ProviderOption[] {
  return listProviders().map((row) => ({
    id: row.id,
    name: row.name,
    connected: row.configured,
    models: knownModels(row.activeModel, row.models),
  }));
}

function knownModels(activeModel: string, models: readonly string[]): string[] {
  if (!models.length) return [];
  return models.includes(activeModel) || !activeModel
    ? [...models]
    : [activeModel, ...models];
}
