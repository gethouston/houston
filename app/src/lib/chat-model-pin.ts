import { toDisplayProviderId } from "./provider-overrides.ts";
import {
  getModel,
  getProvider,
  isOpenCatalogProvider,
  normalizeLegacyModel,
} from "./providers.ts";

export type ChatModelPinSource = "mission" | "agent" | "deployment";

export interface ChatModelRef {
  provider: string | null;
  model: string | null;
}

export interface ChatModelPin {
  provider: string;
  model: string;
  source: ChatModelPinSource;
}

export interface PinCatalog {
  runs(provider: string, model: string): boolean;
  offers(provider: string, model: string): boolean;
  defaultModel(provider: string): string;
}

export const LIVE_PIN_CATALOG: PinCatalog = {
  runs(provider, model) {
    if (isOpenCatalogProvider(provider)) return true;
    const info = getProvider(provider);
    if (!info || info.models.length === 0) return true;
    return getModel(provider, model) !== undefined;
  },
  offers(provider, model) {
    return getModel(provider, model) !== undefined;
  },
  defaultModel(provider) {
    return getProvider(provider)?.defaultModel ?? "";
  },
};

function names(
  ref: ChatModelRef,
  provider: string,
  catalog: PinCatalog,
): boolean {
  if (ref.provider) return toDisplayProviderId(ref.provider) === provider;
  return !!ref.model && catalog.offers(provider, ref.model);
}

export function resolveChatModelPin(
  provider: string,
  mission: ChatModelRef,
  agent: ChatModelRef,
  catalog: PinCatalog = LIVE_PIN_CATALOG,
): ChatModelPin {
  const settled = toDisplayProviderId(provider);
  const tiers: [ChatModelPinSource, ChatModelRef][] = [
    ["mission", mission],
    ["agent", agent],
  ];
  for (const [source, ref] of tiers) {
    if (!names(ref, settled, catalog)) continue;
    if (ref.model && catalog.runs(settled, ref.model))
      return { provider: settled, model: ref.model, source };
  }
  return {
    provider: settled,
    model: catalog.defaultModel(settled),
    source: "deployment",
  };
}

export function coherentPinModel(
  provider: string,
  model: string,
  catalog: PinCatalog = LIVE_PIN_CATALOG,
): string {
  const current = normalizeLegacyModel(model, provider) ?? model;
  if (current && catalog.runs(provider, current)) return current;
  return catalog.defaultModel(provider) || current;
}
