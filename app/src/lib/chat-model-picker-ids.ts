import type { ProviderInfo } from "./providers.ts";

const ID_SEP = "::";

export function encodeModelPickerId(provider: string, model: string): string {
  return `${provider}${ID_SEP}${model}`;
}

export function decodeModelPickerId(id: string): {
  provider: string;
  model: string;
} {
  const idx = id.indexOf(ID_SEP);
  if (idx === -1) return { provider: id, model: "" };
  return { provider: id.slice(0, idx), model: id.slice(idx + ID_SEP.length) };
}

export function resolveSelectedModelId(
  provider: ProviderInfo | undefined,
  model: string,
  runtimeModelId: string | undefined,
): string {
  if (provider && provider.models.length === 0) return runtimeModelId ?? model;
  return model;
}
