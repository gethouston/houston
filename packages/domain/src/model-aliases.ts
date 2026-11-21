import { GATEWAY_MODEL_ALIASES } from "@houston/domain/model-aliases-gateways";
import { toCanonicalProviderId } from "@houston/domain/provider-dialect";
import type { ProviderId } from "./provider-ids";

export const ANTHROPIC_LINEUP = {
  sonnet: "claude-sonnet-5-5",
  opus: "claude-opus-5-5",
  fable: "claude-fable-5-2",
  haiku: "claude-haiku-5-5",
} as const;

const CLAUDE_FAMILY =
  /^(?:claude-(?:\d+-)*)?(opus|sonnet|fable|haiku)(?:$|[-[])/;

export function anthropicLineupModel(model: string): string | undefined {
  const family = CLAUDE_FAMILY.exec(model)?.[1];
  return family && Object.hasOwn(ANTHROPIC_LINEUP, family)
    ? ANTHROPIC_LINEUP[family as keyof typeof ANTHROPIC_LINEUP]
    : undefined;
}

export const MODEL_ALIASES: Partial<
  Record<ProviderId, Readonly<Record<string, string>>>
> = {
  "openai-codex": {
    "gpt-5": "gpt-6-astra",
    "gpt-5-codex": "gpt-6-astra",
    "gpt-5.1": "gpt-6-astra",
    "gpt-5.2": "gpt-6-astra",
    "gpt-5.4": "gpt-6-astra",
    "gpt-5.5-codex": "gpt-6-astra",
    codex: "gpt-6-astra",
    "gpt-5-mini": "gpt-6-luna",
    "gpt-5.1-mini": "gpt-6-luna",
    "gpt-5.4-mini": "gpt-6-luna",
    "gpt-5.3-codex-spark": "gpt-6-luna",
    "gpt-5.5": "gpt-6.1-sol",
  },
  "github-copilot": {
    "gpt-5-mini": "gpt-6-luna",
    "gpt-5.4-mini": "gpt-6-luna",
    "gpt-5.4": "gpt-5.6-terra",
    "gpt-5.5": "gpt-5.6-terra",
    "claude-opus-4.7": "claude-opus-5.5",
    "gemini-3.5-flash": "gemini-3.8-flash",
    "gemini-3.6-flash": "gemini-3.8-flash",
    "gemini-3.7-flash": "gemini-3.8-flash",
    "mai-code-1-flash-picker": "mai-code-1.1-flash",
  },
  xiaomi: {
    "mimo-v2.5": "mimo-v2.6-flash",
    "mimo-v2.5-pro": "mimo-v2.6-pro",
    "mimo-v2.5-pro-ultraspeed": "mimo-v2.6-pro",
  },
  deepseek: {
    "deepseek-v4-flash": "deepseek-flash",
    "deepseek-v4-flash-vision-exp": "deepseek-flash",
  },
  nvidia: {
    "openai/gpt-oss-20b": "minimaxai/minimax-m3.1-flash",
  },
  "qwen-token-plan": { "deepseek-v4-flash": "deepseek-v4-flash-0731" },
  "qwen-token-plan-cn": { "deepseek-v4-flash": "deepseek-v4-flash-0731" },
  ...GATEWAY_MODEL_ALIASES,
};

export function modelAliasesFor(
  provider: string | null | undefined,
): Readonly<Record<string, string>> {
  if (!provider) return {};
  const canonical = toCanonicalProviderId(provider);
  for (const [id, aliases] of Object.entries(MODEL_ALIASES))
    if (id === canonical && aliases) return aliases;
  return {};
}

export function legacyModelAlias(
  provider: string | null | undefined,
  model: string,
): string | undefined {
  const aliases = modelAliasesFor(provider);
  if (Object.hasOwn(aliases, model)) return aliases[model];
  if (provider && toCanonicalProviderId(provider) === "anthropic")
    return anthropicLineupModel(model);
  return undefined;
}
