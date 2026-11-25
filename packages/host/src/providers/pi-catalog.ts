import {
  type Api,
  getSupportedThinkingLevels,
  type Model,
} from "@earendil-works/pi-ai";
import {
  type BuiltinProvider,
  getModels,
  getProviders,
} from "@earendil-works/pi-ai/compat";
import type {
  CatalogModelEntry,
  CatalogProvider,
  ProviderCatalog,
} from "@houston/protocol";
import {
  ANTHROPIC_PROVIDER_ID,
  withAnthropicLineup,
} from "./anthropic-catalog";
import { BEDROCK_PROVIDER_ID, invokableBedrockModels } from "./bedrock-catalog";
import { withMissionPin } from "./catalog-pin";
import { MINIMAX_PROVIDER, withMinimaxRetired } from "./minimax-catalog";
import { piOAuthProviders } from "./pi-oauth";
import { QWEN_PROVIDER_ID, qwenModels } from "./qwen-dashscope";

type PiModel = Model<Api>;

export function piModelToCatalogEntry(model: PiModel): CatalogModelEntry {
  const entry: CatalogModelEntry = {
    id: model.id,
    name: model.name,
    pricing: {
      input: model.cost.input,
      output: model.cost.output,
      cacheRead: model.cost.cacheRead,
      cacheWrite: model.cost.cacheWrite,
    },
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    reasoning: model.reasoning,
    vision: model.input.includes("image"),
  };
  if (model.reasoning) entry.thinkingLevels = getSupportedThinkingLevels(model);
  return entry;
}

export function piProviderToCatalog(
  id: string,
  models: PiModel[],
  isOAuth: boolean,
  name: string,
): CatalogProvider {
  return {
    id,
    name,
    auth: isOAuth ? "oauth" : "apiKey",
    models: models.map(piModelToCatalogEntry),
  };
}

function providerDisplayName(
  id: string,
  oauthNames: ReadonlyMap<string, string>,
): string {
  const oauth = oauthNames.get(id);
  if (oauth) return oauth;
  return id
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// WHY: Uses pi-ai/compat reads; the new collection API needs an instantiated registry. ADR-0016
export function buildProviderCatalog(): ProviderCatalog {
  const oauthProviders = piOAuthProviders();
  const oauthIds = new Set(oauthProviders.map((p) => p.id));
  const oauthNames = new Map<string, string>(
    oauthProviders.map((p) => [p.id, p.name]),
  );

  const catalog: ProviderCatalog = [];
  for (const id of getProviders()) {
    const models = getModels(id as BuiltinProvider);
    if (models.length === 0) continue;
    const provider = piProviderToCatalog(
      id,
      id === BEDROCK_PROVIDER_ID ? invokableBedrockModels(models) : models,
      oauthIds.has(id),
      providerDisplayName(id, oauthNames),
    );
    catalog.push(
      id === ANTHROPIC_PROVIDER_ID
        ? withAnthropicLineup(provider)
        : id === MINIMAX_PROVIDER
          ? withMinimaxRetired(provider)
          : provider,
    );
  }
  catalog.push(
    piProviderToCatalog(QWEN_PROVIDER_ID, qwenModels(), false, "Qwen"),
  );
  return catalog.map(withMissionPin);
}
