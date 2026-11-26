import {
  type Api,
  getSupportedThinkingLevels,
  type Model,
} from "@earendil-works/pi-ai";
// `getModels`/`getProviders` are pi-ai's legacy static-catalog reads, preserved
// on `/compat` (the new `Models`/`Provider` collection API needs an
// instantiated registry we don't otherwise carry here). `BuiltinProvider` is
// the id union those reads accept — `KnownProvider` additionally names purely
// dynamic providers (radius) with no static catalog entry.
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
import { withModelAliases } from "./alias-catalog";
import {
  ANTHROPIC_PROVIDER_ID,
  withAnthropicLineup,
} from "./anthropic-catalog";
import { BEDROCK_PROVIDER_ID, invokableBedrockModels } from "./bedrock-catalog";
import { withMissionPin } from "./catalog-pin";
import { MINIMAX_PROVIDER, withMinimaxRetired } from "./minimax-catalog";
import { piOAuthProviders } from "./pi-oauth";
import { QWEN_PROVIDER_ID, qwenModels } from "./qwen-dashscope";

/**
 * Builds the `GET /v1/catalog` body from pi-ai's static, in-process model
 * registry — every provider and every model the runtime can actually run. The
 * registry is baked (no network), so this is identical on every deployment:
 * desktop and the managed cloud pod serve the SAME full provider set (the pod
 * runs the local-profile host/runtime, and pod egress reaches every provider's
 * public :443 endpoint — there is no cloud provider subset).
 *
 * Split into PURE mappers (`piModelToCatalogEntry`, `piProviderToCatalog`) that
 * take plain pi-ai values so they unit-test without touching the live registry,
 * and `buildProviderCatalog`, the thin orchestrator that enumerates pi-ai.
 */

/** A pi-ai model of any api — the mappers never look at the `TApi` specifics. */
type PiModel = Model<Api>;

/** Map one pi-ai `Model` to a wire `CatalogModelEntry`. Pure and deterministic. */
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
    // pi-ai's `input` modality list carries "image" iff the model accepts vision.
    vision: model.input.includes("image"),
  };
  // The effort selector only applies to reasoning models. `getSupportedThinkingLevels`
  // is pi-ai's canonical source: it honors levels a model marks unsupported
  // (`thinkingLevelMap` value `null`) and the xhigh availability rule, which a
  // raw key scan of `thinkingLevelMap` would misreport. Non-reasoning models
  // yield just `["off"]`, which is not a meaningful choice — omit the field.
  if (model.reasoning) entry.thinkingLevels = getSupportedThinkingLevels(model);
  return entry;
}

/**
 * Map one provider (id + its models) to a wire `CatalogProvider`. Pure: `isOAuth`
 * and `name` are passed in so the mapper never touches the live OAuth registry.
 */
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

/**
 * Provider display name. pi-ai's ONLY per-provider names worth surfacing are
 * the OAuth ones (`piOAuthProviders()` → e.g. "Anthropic (Claude Pro/Max)");
 * the model registry (`getProviders()`) exposes bare ids. So: use pi-ai's
 * OAuth name when it has one, else a titleized id ("amazon-bedrock" →
 * "Amazon Bedrock"). The frontend owns brand labels/logos; this `name` is a
 * deterministic fallback.
 */
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

/**
 * Enumerate pi-ai and build the `ProviderCatalog` — EVERY pi-ai provider and
 * model, on every deployment. There is no profile gating: the managed cloud pod
 * runs the same local-profile host/runtime as desktop and its egress reaches
 * every provider's public :443 endpoint, so a hosted user sees the full catalog
 * too. Deterministic — no clock, no IO.
 *
 * Three providers are shaped. Bedrock's pi-ai list is mostly ids Bedrock itself
 * refuses (see ./bedrock-catalog); the catalog is the RUNNABLE set, so those
 * never reach a picker. Anthropic runs one model per Claude family, so its
 * retired rows name the lineup model they run as (see ./anthropic-catalog),
 * and MiniMax's retired ids name the MiniMax default (see ./minimax-catalog).
 * Every provider's renamed ids name their successor (see ./alias-catalog).
 */
export function buildProviderCatalog(): ProviderCatalog {
  const oauthProviders = piOAuthProviders();
  const oauthIds = new Set(oauthProviders.map((p) => p.id));
  const oauthNames = new Map<string, string>(
    oauthProviders.map((p) => [p.id, p.name]),
  );

  const catalog: ProviderCatalog = [];
  for (const id of getProviders()) {
    const models = getModels(id as BuiltinProvider);
    // A provider whose baked catalog holds no chat model (pi 0.99's `typesafe`
    // ships only classifier rows) has nothing a picker could run.
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
          : withModelAliases(provider),
    );
  }
  // Houston's qwen extension provider (DashScope international pay-as-you-go)
  // — not a pi builtin, so it is appended explicitly (see ./qwen-dashscope).
  catalog.push(
    piProviderToCatalog(QWEN_PROVIDER_ID, qwenModels(), false, "Qwen"),
  );
  return catalog.map(withMissionPin);
}
