import type { ProviderOption } from "@houston/domain";
import { listProviders } from "./providers";

/**
 * The provider status surface, as an agent-facing choice list.
 *
 * Deliberately the SAME rows the `/providers` status route serves the app's
 * model picker (`listProviders`), so "connected" means exactly one thing in
 * Houston: `configured` — a credential/endpoint that can actually answer a
 * turn, not merely a stored artifact. A tool that offered a different set than
 * the picker would be a second notion of connected, and the two would drift.
 *
 * Disconnected providers are KEPT (with `connected: false`) so a pin naming one
 * is refused by name — "anthropic is not connected here" — instead of reading
 * as a typo.
 */
export function connectedProviderChoices(): ProviderOption[] {
  return listProviders().map((row) => ({
    id: row.id,
    name: row.name,
    connected: row.configured,
    models: knownModels(row.activeModel, row.models),
  }));
}

/**
 * The model ids that count as known for a provider: its catalog plus the model
 * it is currently set to. An EMPTY catalog stays empty — that is the open-
 * catalog signal (a gateway that forwards any id, a BYO endpoint), and folding
 * the active model in would turn it into a closed set of exactly one.
 */
function knownModels(activeModel: string, models: readonly string[]): string[] {
  if (!models.length) return [];
  return models.includes(activeModel) || !activeModel
    ? [...models]
    : [activeModel, ...models];
}
