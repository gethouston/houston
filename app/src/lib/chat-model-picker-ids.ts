/**
 * The picker's opaque row id: a reversible `${provider}::${model}` encoding of a
 * runnable (provider, model) pair, plus the resolver for which model id marks the
 * active row. Split from `chat-model-picker-map.ts` so both the map and the
 * container import the id codec without carrying the whole mapping module.
 */

import type { ProviderInfo } from "./providers.ts";

/**
 * Separator for the opaque picker id. Provider ids are plain slugs and no model
 * id contains a double colon (Bedrock ids carry a single `:`, OpenRouter ids a
 * `/`), so splitting on the FIRST `::` round-trips every runnable pair.
 */
const ID_SEP = "::";

/** Encode a runnable (provider, model) pair into the picker's opaque row id. */
export function encodeModelPickerId(provider: string, model: string): string {
  return `${provider}${ID_SEP}${model}`;
}

/** Decode a picker row id back into its (provider, model) pair. */
export function decodeModelPickerId(id: string): {
  provider: string;
  model: string;
} {
  const idx = id.indexOf(ID_SEP);
  if (idx === -1) return { provider: id, model: "" };
  return { provider: id.slice(0, idx), model: id.slice(idx + ID_SEP.length) };
}

/**
 * The model id that marks the active row for a provider. A catalog-less provider
 * (the local `openai-compatible` one) has no stored model id — its single row is
 * the engine-reported `active_model`, so the selection resolves to that too.
 */
export function resolveSelectedModelId(
  provider: ProviderInfo | undefined,
  model: string,
  runtimeModelId: string | undefined,
): string {
  if (provider && provider.models.length === 0) return runtimeModelId ?? model;
  return model;
}
