import { canonicalModelId, canonicalProviderId } from "./provider-model";
import { namedModelList, resolveSpokenModel } from "./provider-model-display";

export interface ProviderOption {
  id: string;
  name: string;
  connected: boolean;
  models?: readonly string[];
}

export type ChoiceResolution =
  | { ok: true; id: string }
  | {
      ok: false;
      reason: "unknown" | "disconnected" | "none_connected";
      message: string;
    };

const MAX_LISTED_MODELS = 25;

export function connectedProviderList(
  options: readonly ProviderOption[],
): string {
  return options
    .filter((o) => o.connected)
    .map((o) => `${o.id} (${o.name})`)
    .join(", ");
}

export function resolveProviderChoice(
  raw: string,
  options: readonly ProviderOption[],
  operation: string,
): ChoiceResolution {
  const connected = connectedProviderList(options);
  const given = JSON.stringify(raw);
  if (!connected) {
    return {
      ok: false,
      reason: "none_connected",
      message: `No AI provider is connected here, so "provider" cannot be pinned. Omit it and ${operation} uses the agent's current model. You gave ${given}.`,
    };
  }
  const match = matchProvider(raw, options);
  if (!match) {
    return {
      ok: false,
      reason: "unknown",
      message: `The value given for "provider" does not match what ${operation} accepts. "provider" must be one of: ${connected}. You gave ${given}. Omit "provider" to use the agent's current model.`,
    };
  }
  if (!match.connected) {
    return {
      ok: false,
      reason: "disconnected",
      message: `${match.id} (${match.name}) is not connected here, so a mission pinned to it would fail. Connect it in Houston first (the user does that in the app), or omit "provider" to use the agent's current model. Connected right now: ${connected}.`,
    };
  }
  return { ok: true, id: match.id };
}

export function resolveModelChoice(
  raw: string,
  provider: ProviderOption,
  operation: string,
): ChoiceResolution {
  const wanted = raw.trim();
  const models = provider.models ?? [];
  const spoken = resolveSpokenModel(provider.id, wanted, models);
  if (!models.length) return { ok: true, id: spoken?.id ?? wanted };
  const exact = models.find((m) => m.toLowerCase() === wanted.toLowerCase());
  if (exact) return { ok: true, id: exact };
  if (spoken) return { ok: true, id: spoken.id };
  const alias = canonicalModelId(provider.id, wanted);
  if (alias && models.includes(alias)) return { ok: true, id: alias };
  return {
    ok: false,
    reason: "unknown",
    message: `The value given for "model" does not match what ${operation} accepts for ${provider.id} (${provider.name}). "model" must be one of: ${namedModelList(provider.id, models, MAX_LISTED_MODELS)}. You gave ${JSON.stringify(raw)}. Omit "model" to use that provider's default.`,
  };
}

function matchProvider(
  raw: string,
  options: readonly ProviderOption[],
): ProviderOption | undefined {
  const wanted = raw.trim().toLowerCase();
  if (!wanted) return undefined;
  const byId = options.find((o) => o.id.toLowerCase() === wanted);
  if (byId) return byId;
  const byName = options.find((o) => o.name.toLowerCase() === wanted);
  if (byName) return byName;
  const canonical = canonicalProviderId(wanted);
  return canonical
    ? options.find((o) => o.id.toLowerCase() === canonical.toLowerCase())
    : undefined;
}
