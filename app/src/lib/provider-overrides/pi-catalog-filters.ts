export {
  DROP_PI_PROVIDERS,
  REGIONAL_SUFFIX,
} from "@houston/sdk/provider-catalog";

export const VISIBLE_MODELS: Readonly<Record<string, ReadonlySet<string>>> = {
  "azure-openai-responses": new Set([
    "gpt-6-luna",
    "gpt-6-sol",
    "gpt-6.2-sol",
    "gpt-6-astra",
    "gpt-6.2-astra",
    "gpt-5.5",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    "gpt-5.3-codex-spark",
    "gpt-5.4",
    "gpt-5.4-mini",
  ]),
  openai: new Set([
    "gpt-6-luna",
    "gpt-6.1-terra",
    "gpt-6-sol",
    "gpt-6.1-sol",
    "gpt-6.2-sol",
    "gpt-6-astra",
    "gpt-6.2-astra",
  ]),
  anthropic: new Set([
    "claude-sonnet-5-5",
    "claude-opus-5-5",
    "claude-fable-5-2",
    "claude-haiku-5-5",
  ]),
  minimax: new Set(["MiniMax-M3.1-Flash", "MiniMax-M3"]),
  google: new Set([
    "gemini-4-neon",
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemma-4-26b-a4b-it",
    "gemma-4-31b-it",
  ]),
  moonshotai: new Set([
    "kimi-k3",
    "kimi-k2.7-code",
    "kimi-k2.7-code-highspeed",
    "kimi-k2.6",
  ]),
};

function isOpenRouterAlias(providerId: string, modelId: string): boolean {
  return providerId === "openrouter" && modelId.startsWith("~");
}

export function isModelVisible(providerId: string, modelId: string): boolean {
  if (isOpenRouterAlias(providerId, modelId)) return false;
  const visible = VISIBLE_MODELS[providerId];
  return !visible || visible.has(modelId);
}
