import type { Api, Model } from "@earendil-works/pi-ai";

/**
 * Narrow pi-ai's `amazon-bedrock` catalog to the ids a plain Bedrock API key can
 * actually invoke. pi-ai lists ~120 Bedrock ids, most of which Bedrock refuses
 * on demand, and the picker dedupes a model's variants down to the SHORTEST id
 * (`dedupeModelEntries` in app/src/lib/providers.ts) — which for Bedrock is
 * exactly the broken one:
 *
 * - Bare `anthropic.claude-*` foundation ids: Bedrock serves Claude 4.x and
 *   newer ONLY through inference profiles, so every on-demand invocation of a
 *   bare id fails with "Invocation of model ID … with on-demand throughput
 *   isn't supported" (the default-model half was PRODUCT-1477; the picker
 *   half is this filter).
 * - Regional profiles (`au.` / `eu.` / `jp.` / `us.`): each exists only in its
 *   own region's endpoint, so from the endpoint the runtime targets the
 *   others answer "The provided model identifier is invalid". Keeping `us.`
 *   would also let the picker's shortest-id dedupe prefer it over the
 *   `global.` twin, hiding the curated/default id.
 *
 * Kept: `global.` cross-region inference profiles (region-agnostic, and the
 * ids the host/runtime defaults and the frontend overrides already name) and
 * Amazon's own `amazon.` Nova models (on-demand foundation ids, verified live
 * on a user's key alongside `global.anthropic.claude-sonnet-4-6`).
 */
const INVOKABLE_BEDROCK_ID_PREFIXES = ["global.", "amazon."] as const;

export const BEDROCK_PROVIDER_ID = "amazon-bedrock";

/** Whether a Bedrock model id is one a plain Bedrock API key can invoke. */
export function isInvokableBedrockModelId(id: string): boolean {
  return INVOKABLE_BEDROCK_ID_PREFIXES.some((prefix) => id.startsWith(prefix));
}

/** Pure: drop the Bedrock ids Bedrock itself refuses. Preserves catalog order. */
export function invokableBedrockModels<M extends Model<Api>>(
  models: readonly M[],
): M[] {
  return models.filter((m) => isInvokableBedrockModelId(m.id));
}
