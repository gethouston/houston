import { toDisplayProviderIdOrNull } from "./provider-overrides.ts";
import { getDefaultModel, PROVIDERS, validModelOrNull } from "./providers.ts";

export interface PickDefaultProviderModelOptions {
  lastUsedProvider: string | null | undefined;
  lastUsedModel: string | null | undefined;
  connectedProviders: ReadonlySet<string> | readonly string[];
}

/**
 * Selects a new agent's provider only from confirmed connections when any
 * exist, preserving the stored model only when it remains valid for that
 * provider. An empty confirmed set retains the non-blocking legacy fallback.
 *
 * Every id is put into the DISPLAY dialect first: the stored preference and the
 * confirmed-connection set can carry pi's canonical `openai-codex`, and an
 * unaliased id missed the display-keyed catalog entirely — the pick then
 * inherited whatever `getDefaultModel` answered for an unknown provider (a
 * Claude model id, on a Codex agent) and the creation flow persisted that pair.
 */
export function pickDefaultProviderModel({
  lastUsedProvider,
  lastUsedModel,
  connectedProviders,
}: PickDefaultProviderModelOptions): {
  provider: string;
  model: string;
  confirmed: boolean;
} {
  const connected = new Set(
    [...connectedProviders].map((id) => toDisplayProviderIdOrNull(id) ?? id),
  );
  const lastUsed = toDisplayProviderIdOrNull(lastUsedProvider);
  const confirmedProvider =
    lastUsed && connected.has(lastUsed)
      ? lastUsed
      : PROVIDERS.find((candidate) => connected.has(candidate.id))?.id;
  const provider = confirmedProvider ?? lastUsed ?? "anthropic";

  return {
    provider,
    model:
      provider === lastUsed
        ? (validModelOrNull(provider, lastUsedModel) ??
          getDefaultModel(provider))
        : getDefaultModel(provider),
    confirmed: confirmedProvider !== undefined,
  };
}
