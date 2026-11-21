import type { ProviderId } from "./provider-ids";

export const VALID_MODELS: Partial<Record<ProviderId, ReadonlySet<string>>> = {
  anthropic: new Set([
    "claude-fable-5-2",
    "claude-haiku-5-5",
    "claude-opus-5-5",
    "claude-sonnet-5-5",
  ]),
  "openai-codex": new Set([
    "gpt-5.6-luna",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-6-astra",
    "gpt-6.2-astra",
    "gpt-6-luna",
    "gpt-6.1-terra",
    "gpt-6-sol",
    "gpt-6.1-sol",
    "gpt-6.2-sol",
  ]),
  minimax: new Set(["MiniMax-M3.1-Flash", "MiniMax-M3"]),
  deepseek: new Set(["deepseek-flash", "deepseek-v4-pro"]),
};
