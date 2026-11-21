import type {
  CatalogModel,
  CatalogOffer,
  HubCatalog,
} from "../../lib/ai-hub/catalog-types.ts";
import type { ProviderConnectionState } from "../../lib/provider-connection.ts";
import { PROVIDER_OVERRIDES } from "../../lib/provider-overrides.ts";
import {
  getConnectProviders,
  type ProviderInfo,
  providerGatewayIds,
} from "../../lib/providers.ts";

export interface ProviderGroups {
  connected: ProviderInfo[];
  checking: ProviderInfo[];
  available: ProviderInfo[];
}

export function groupProviders(
  providers: readonly ProviderInfo[],
  connectionState: (p: ProviderInfo) => ProviderConnectionState,
): ProviderGroups {
  const groups: ProviderGroups = {
    connected: [],
    checking: [],
    available: [],
  };
  for (const provider of providers) {
    const state = connectionState(provider);
    if (state === "connected") groups.connected.push(provider);
    else if (state === "checking") groups.checking.push(provider);
    else groups.available.push(provider);
  }
  return groups;
}

export function providerOwnedSide(groups: ProviderGroups): ProviderInfo[] {
  return [...groups.connected, ...groups.checking];
}

export type AuthChipKey = "subscription" | "apiKey" | "gateway" | "local";

export function authChipKey(provider: ProviderInfo): AuthChipKey {
  if (provider.auth === "openaiCompatible") return "local";
  if (provider.auth !== "apiKey") return "subscription";
  if (provider.gatewayIds || provider.id === "openrouter") return "gateway";
  return "apiKey";
}

export interface AuthTypeGroups {
  subscription: ProviderInfo[];
  apiKey: ProviderInfo[];
}

export function groupByAuthType(
  providers: readonly ProviderInfo[],
  authType: (p: ProviderInfo) => AuthChipKey = authChipKey,
): AuthTypeGroups {
  const subscription: ProviderInfo[] = [];
  const apiKey: ProviderInfo[] = [];
  for (const provider of providers)
    (authType(provider) === "subscription" ? subscription : apiKey).push(
      provider,
    );
  return { subscription, apiKey };
}

export function providerModels(
  catalog: HubCatalog,
  provider: ProviderInfo,
): CatalogModel[] {
  const seen = new Set<string>();
  const out: CatalogModel[] = [];
  for (const gatewayId of providerGatewayIds(provider))
    for (const model of catalog.byProvider.get(gatewayId) ?? [])
      if (!seen.has(model.key)) {
        seen.add(model.key);
        out.push(model);
      }
  return out;
}

export function connectCardByGatewayId(): Map<string, ProviderInfo> {
  const map = new Map<string, ProviderInfo>();
  for (const card of getConnectProviders({ newEngine: true, desktop: true }))
    for (const gatewayId of providerGatewayIds(card)) map.set(gatewayId, card);
  return map;
}

export function offerForProvider(
  model: CatalogModel,
  provider: ProviderInfo,
): CatalogOffer | undefined {
  const gateways = new Set(providerGatewayIds(provider));
  return model.offers.find((offer) => gateways.has(offer.providerId));
}

export type ProviderBilling = "subscription" | "payg";

export function providerBilling(
  provider: ProviderInfo,
): ReadonlySet<ProviderBilling> {
  const kinds = new Set<ProviderBilling>();
  if (provider.auth === "openaiCompatible") return kinds;
  for (const id of providerGatewayIds(provider)) {
    kinds.add(
      PROVIDER_OVERRIDES[id]?.billing ??
        (provider.auth === "oauth" ? "subscription" : "payg"),
    );
  }
  return kinds;
}

export type ProviderDescriptionKey =
  | "openai"
  | "anthropic"
  | "github-copilot"
  | "opencode-account"
  | "openrouter"
  | "deepseek"
  | "google"
  | "amazon-bedrock"
  | "minimax"
  | "nvidia"
  | "openai-compatible"
  | "xiaomi";

const DESCRIPTION_KEY_BY_ID = {
  openai: "openai",
  anthropic: "anthropic",
  "github-copilot": "github-copilot",
  opencode: "opencode-account",
  "opencode-account": "opencode-account",
  openrouter: "openrouter",
  deepseek: "deepseek",
  google: "google",
  "amazon-bedrock": "amazon-bedrock",
  minimax: "minimax",
  nvidia: "nvidia",
  "openai-compatible": "openai-compatible",
  xiaomi: "xiaomi",
} satisfies Record<string, ProviderDescriptionKey>;

export function providerDescriptionKey(
  providerId: string,
): ProviderDescriptionKey | (string & {}) {
  return (
    DESCRIPTION_KEY_BY_ID[providerId as keyof typeof DESCRIPTION_KEY_BY_ID] ??
    providerId
  );
}
