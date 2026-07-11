/**
 * Pure logic for the provider marketplace: grouping providers into
 * Connected / Available sections, resolving a card's model count and model
 * list across its gateway ids (the merged OpenCode account spans two), how a
 * card is billed, and the i18n key each card's description maps to.
 *
 * Kept separate from the React components so it can be unit-tested with
 * `node --test` (see `app/tests/provider-grouping.test.ts`).
 */

import type {
  CatalogModel,
  CatalogOffer,
  HubCatalog,
} from "../../lib/ai-hub/catalog-types.ts";
import { PROVIDER_OVERRIDES } from "../../lib/provider-overrides.ts";
import {
  getConnectProviders,
  type ProviderInfo,
  providerGatewayIds,
} from "../../lib/providers.ts";

/** Connected providers first, otherwise catalog order is preserved. */
export interface ProviderGroups {
  connected: ProviderInfo[];
  available: ProviderInfo[];
}

/**
 * Split active providers into Connected / Available, preserving the incoming
 * (catalog) order within each group. Connected cards render first.
 */
export function groupProviders(
  providers: readonly ProviderInfo[],
  isConnected: (p: ProviderInfo) => boolean,
): ProviderGroups {
  const connected: ProviderInfo[] = [];
  const available: ProviderInfo[] = [];
  for (const provider of providers)
    (isConnected(provider) ? connected : available).push(provider);
  return { connected, available };
}

/** The `card.*` i18n key describing how a provider connects. */
export type AuthChipKey = "subscription" | "apiKey" | "gateway" | "local";

/**
 * Which auth chip a provider shows. OAuth / Copilot plans read as
 * "Subscription"; the local server as "Runs on your computer"; multi-lab
 * key gateways (OpenRouter, the merged OpenCode account) as "Multi-model
 * gateway"; every other pasted key as "Your API key".
 */
export function authChipKey(provider: ProviderInfo): AuthChipKey {
  if (provider.auth === "openaiCompatible") return "local";
  if (provider.auth !== "apiKey") return "subscription";
  if (provider.gatewayIds || provider.id === "openrouter") return "gateway";
  return "apiKey";
}

/** Providers split by how they connect: subscription vs. your own API key. */
export interface AuthTypeGroups {
  subscription: ProviderInfo[];
  apiKey: ProviderInfo[];
}

/**
 * Partition providers into the BINARY connect-type split the curated onboarding
 * view uses (unlike the hub's richer subscription/free/payg/local facets): the
 * "subscription" auth chip (OAuth / plan providers) goes to `subscription`;
 * everything else — a pasted "apiKey", a multi-lab "gateway", and the "local"
 * OpenAI-compatible server — goes to `apiKey`, since all three are "you
 * configure a key or endpoint" rather than "you log into a plan". Preserves the
 * incoming order within each bucket. Pure, so it unit-tests with `node --test`.
 */
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

/**
 * The unique models a card offers, unioned across its gateway ids (the merged
 * OpenCode account maps to `opencode` + `opencode-go`) and de-duplicated by the
 * cross-provider model key. Order follows the catalog's newest-first sort.
 */
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

/**
 * A reverse lookup from an offer's engine gateway id to the connect card that
 * runs it. The merged OpenCode account (id `opencode`) owns both `opencode` and
 * `opencode-go`, so an offer under either resolves to the one card. Built from
 * the full connect-card set (engine/capability gating is irrelevant to the
 * reverse map — catalog visibility already decides which offers reach the UI).
 * Shared so the marketplace and the model detail resolve offers identically.
 */
export function connectCardByGatewayId(): Map<string, ProviderInfo> {
  const map = new Map<string, ProviderInfo>();
  for (const card of getConnectProviders({ newEngine: true, desktop: true }))
    for (const gatewayId of providerGatewayIds(card)) map.set(gatewayId, card);
  return map;
}

/** The offer a given card contributes for a model, if any. */
export function offerForProvider(
  model: CatalogModel,
  provider: ProviderInfo,
): CatalogOffer | undefined {
  const gateways = new Set(providerGatewayIds(provider));
  return model.offers.find((offer) => gateways.has(offer.providerId));
}

/** How a provider is billed: a flat plan with usage included, or metered per token. */
export type ProviderBilling = "subscription" | "payg";

/**
 * How a provider is BILLED — as opposed to `provider.auth`, how you CONNECT.
 * They usually coincide (the three OAuth sign-in providers are flat
 * subscriptions; every pasted-key provider is pay-as-you-go) but not always:
 * OpenCode Go is a flat $10/month subscription unlocked with a pasted key
 * (`PROVIDER_OVERRIDES["opencode-go"].billing` overrides the apiKey default).
 * A card spanning gateway ids with DIFFERENT billing (the merged OpenCode
 * account: Zen is payg, Go is a subscription, one shared key) returns BOTH —
 * it genuinely belongs under either filter, not just one. The local
 * (`openaiCompatible`) provider has no billing relationship at all and
 * returns an empty set.
 */
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

/** The `aiHub:providers.*` description key for a card. */
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
  | "openai-compatible";

/**
 * Every connect-card id and the `aiHub:providers.*` key its copy lives under.
 * The merged OpenCode account has id `opencode` but reads from `opencode-account`;
 * every other card matches its own id. Typed `satisfies Record<…,
 * ProviderDescriptionKey>` so a new description key must be wired here (or fail
 * typecheck), and lookups fall back to the raw id — which renders the visibly
 * missing key rather than silently borrowing another provider's copy.
 */
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
  "openai-compatible": "openai-compatible",
} satisfies Record<string, ProviderDescriptionKey>;

/**
 * Map a card id to its description key. Unknown ids fall back to the id itself,
 * so an unwired provider surfaces a missing-key string in the UI (a visible bug)
 * instead of a silent, wrong description.
 */
export function providerDescriptionKey(
  providerId: string,
): ProviderDescriptionKey | (string & {}) {
  return (
    DESCRIPTION_KEY_BY_ID[providerId as keyof typeof DESCRIPTION_KEY_BY_ID] ??
    providerId
  );
}
