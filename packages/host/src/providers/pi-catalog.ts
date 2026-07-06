import {
  type Api,
  getModels,
  getProviders,
  getSupportedThinkingLevels,
  type KnownProvider,
  type Model,
} from "@earendil-works/pi-ai";
import { getOAuthProviders } from "@earendil-works/pi-ai/oauth";
import type {
  Capabilities,
  CatalogModelEntry,
  CatalogProvider,
  ProviderCatalog,
} from "@houston/protocol";
import { isCloudProvider } from "../providers";

/**
 * Builds the `GET /v1/catalog` body from pi-ai's static, in-process model
 * registry — every provider and every model the runtime can actually run. The
 * registry is baked (no network), so this is identical on desktop and inside an
 * egress-locked cloud pod.
 *
 * Split into PURE mappers (`piModelToCatalogEntry`, `piProviderToCatalog`) that
 * take plain pi-ai values so they unit-test without touching the live registry,
 * and `buildProviderCatalog`, the thin orchestrator that enumerates pi-ai and
 * applies profile gating.
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
 * Provider display name. pi-ai's ONLY per-provider names are the OAuth ones
 * (`getOAuthProviders()` → e.g. "Anthropic (Claude Pro/Max)"); the model
 * registry (`getProviders()`) exposes bare ids. So: use pi-ai's OAuth name when
 * it has one, else a titleized id ("amazon-bedrock" → "Amazon Bedrock"). The
 * frontend owns brand labels/logos; this `name` is a deterministic fallback.
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
 * Whether this deployment actually runs `providerId`. The local/desktop profile
 * runs every pi-ai provider (open egress, in-process), while an egress-locked
 * cloud deployment runs only the providers its per-turn sandbox can reach —
 * `isCloudProvider` (the host catalog's `cloud: true` set: `CLOUD_PROVIDERS`).
 */
function reachable(
  profile: Capabilities["profile"],
  providerId: string,
): boolean {
  return profile === "local" || isCloudProvider(providerId);
}

/**
 * Enumerate pi-ai and build the profile-gated `ProviderCatalog`. Desktop/local
 * returns ALL pi-ai providers; an egress-locked cloud profile returns only the
 * providers it can run (see `reachable`). Deterministic — no clock, no IO.
 */
export function buildProviderCatalog(
  profile: Capabilities["profile"],
): ProviderCatalog {
  const oauthProviders = getOAuthProviders();
  const oauthIds = new Set(oauthProviders.map((p) => p.id));
  const oauthNames = new Map(oauthProviders.map((p) => [p.id, p.name]));

  const catalog: ProviderCatalog = [];
  for (const id of getProviders()) {
    if (!reachable(profile, id)) continue;
    catalog.push(
      piProviderToCatalog(
        id,
        getModels(id as KnownProvider),
        oauthIds.has(id),
        providerDisplayName(id, oauthNames),
      ),
    );
  }
  return catalog;
}
