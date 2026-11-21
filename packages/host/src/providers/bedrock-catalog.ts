import type { Api, Model } from "@earendil-works/pi-ai";

const INVOKABLE_BEDROCK_ID_PREFIXES = ["global.", "amazon."] as const;

export const BEDROCK_PROVIDER_ID = "amazon-bedrock";

export function isInvokableBedrockModelId(id: string): boolean {
  return INVOKABLE_BEDROCK_ID_PREFIXES.some((prefix) => id.startsWith(prefix));
}

export function invokableBedrockModels<M extends Model<Api>>(
  models: readonly M[],
): M[] {
  return models.filter((m) => isInvokableBedrockModelId(m.id));
}
