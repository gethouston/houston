import type {
  CatalogModelEntry,
  CatalogProvider,
  ProviderCatalog,
} from "@houston/protocol";

const PI_REASONING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
];

function m(
  id: string,
  opts: Partial<CatalogModelEntry> & { name?: string } = {},
): CatalogModelEntry {
  return {
    id,
    name: opts.name ?? id,
    pricing: opts.pricing ?? { input: 1, output: 2 },
    contextWindow: opts.contextWindow ?? 200_000,
    maxTokens: opts.maxTokens ?? 8_192,
    reasoning: opts.reasoning ?? false,
    vision: opts.vision ?? false,
    ...(opts.thinkingLevels ? { thinkingLevels: opts.thinkingLevels } : {}),
  };
}

function reasoningModel(
  id: string,
  extra: Partial<CatalogModelEntry> = {},
): CatalogModelEntry {
  return m(id, {
    reasoning: true,
    thinkingLevels: PI_REASONING_LEVELS,
    ...extra,
  });
}

const provider = (
  id: string,
  auth: CatalogProvider["auth"],
  models: CatalogModelEntry[],
  name = id,
): CatalogProvider => ({ id, name, auth, models });

export const SAMPLE_CATALOG: ProviderCatalog = [
  provider("openai", "apiKey", [m("gpt-4o"), m("gpt-4o-mini")], "Openai"),
  provider(
    "openai-codex",
    "oauth",
    [
      reasoningModel("gpt-6-astra", { contextWindow: 272_000, vision: true }),
      reasoningModel("gpt-5.6-sol", { contextWindow: 372_000, vision: true }),
      reasoningModel("gpt-5.6-terra", { contextWindow: 372_000, vision: true }),
      reasoningModel("gpt-5.6-luna", { contextWindow: 372_000 }),
      reasoningModel("gpt-6.1-terra", { contextWindow: 500_000 }),
      reasoningModel("gpt-6.1-sol", { contextWindow: 500_000 }),
      reasoningModel("gpt-5.5", { contextWindow: 272_000 }),
      reasoningModel("gpt-5.3-codex-spark", { contextWindow: 128_000 }),
      reasoningModel("gpt-5.4", { contextWindow: 272_000 }),
      reasoningModel("gpt-5.2", { contextWindow: 272_000 }),
    ],
    "ChatGPT subscription",
  ),
  provider("anthropic", "oauth", [
    reasoningModel("claude-sonnet-5-5", {
      contextWindow: 1_000_000,
      vision: true,
    }),
    reasoningModel("claude-opus-5-5", { contextWindow: 1_000_000 }),
    reasoningModel("claude-sonnet-5", {
      contextWindow: 1_000_000,
      vision: true,
    }),
    reasoningModel("claude-opus-5", { contextWindow: 1_000_000 }),
    reasoningModel("claude-opus-4-8", { contextWindow: 1_000_000 }),
    reasoningModel("claude-fable-5-2", {
      contextWindow: 1_000_000,
      maxTokens: 128_000,
      vision: true,
      pricing: { input: 8, output: 40, cacheRead: 0.2, cacheWrite: 10 },
      thinkingLevels: ["low", "medium", "high", "xhigh", "max"],
    }),
    reasoningModel("claude-fable-5-1", { contextWindow: 1_000_000 }),
    reasoningModel("claude-haiku-5-5", {
      contextWindow: 1_000_000,
      vision: true,
    }),
    reasoningModel("claude-fable-5", { contextWindow: 1_000_000 }),
    reasoningModel("claude-sonnet-4-6", { contextWindow: 200_000 }),
    reasoningModel("claude-opus-4-7", { contextWindow: 1_000_000 }),
    reasoningModel("claude-haiku-4-5", { contextWindow: 200_000 }),
  ]),
  provider("github-copilot", "oauth", [
    m("gpt-4.1", { contextWindow: 200_000 }),
    reasoningModel("claude-sonnet-4.6", { contextWindow: 1_000_000 }),
    reasoningModel("claude-opus-4.8", { contextWindow: 200_000 }),
    m("claude-haiku-4.5", { contextWindow: 200_000 }),
    reasoningModel("gpt-6.1-sol", { contextWindow: 400_000 }),
    reasoningModel("gpt-6-luna", { contextWindow: 264_000 }),
    reasoningModel("gemini-3-flash-preview", { contextWindow: 128_000 }),
  ]),
  provider("opencode", "apiKey", [
    reasoningModel("claude-sonnet-4-6", { contextWindow: 1_000_000 }),
    reasoningModel("claude-opus-4-8", { contextWindow: 1_000_000 }),
    reasoningModel("gpt-5.5", { contextWindow: 1_050_000 }),
    reasoningModel("gpt-6.1-sol", { contextWindow: 1_050_000 }),
    reasoningModel("gemini-3.5-flash", { contextWindow: 1_048_576 }),
    reasoningModel("deepseek-v4-flash-free", { contextWindow: 200_000 }),
    m("mimo-v2.5-free", { contextWindow: 200_000 }),
    m("nemotron-3-ultra-free", { contextWindow: 1_000_000 }),
  ]),
  provider("opencode-go", "apiKey", [
    m("glm-5.1", { contextWindow: 202_752 }),
    m("kimi-k2.6", { contextWindow: 262_144 }),
    reasoningModel("minimax-m3", { contextWindow: 512_000 }),
    m("qwen3.7-max", { contextWindow: 1_000_000 }),
    reasoningModel("deepseek-v4-pro", { contextWindow: 1_000_000 }),
  ]),
  provider("openrouter", "apiKey", [
    m("openrouter/free", { contextWindow: 200_000 }),
    reasoningModel("anthropic/claude-sonnet-4.6", { contextWindow: 1_000_000 }),
    reasoningModel("anthropic/claude-opus-4.8", { contextWindow: 1_000_000 }),
    reasoningModel("google/gemini-3-flash-preview", {
      contextWindow: 1_048_576,
    }),
    reasoningModel("deepseek/deepseek-v4-pro", { contextWindow: 1_048_576 }),
  ]),
  provider("deepseek", "apiKey", [
    reasoningModel("deepseek-v4-flash", { contextWindow: 1_000_000 }),
    reasoningModel("deepseek-v4-pro", { contextWindow: 1_000_000 }),
  ]),
  provider("google", "apiKey", [
    reasoningModel("gemini-3.8-flash", { contextWindow: 1_048_576 }),
    reasoningModel("gemini-3.7-flash", { contextWindow: 1_048_576 }),
    reasoningModel("gemini-3.5-flash", { contextWindow: 1_048_576 }),
    reasoningModel("gemini-3.1-flash-lite", { contextWindow: 1_048_576 }),
    m("gemma-4-26b-a4b-it", { contextWindow: 131_072 }),
    m("gemma-4-31b-it", { contextWindow: 131_072 }),
    reasoningModel("gemini-3-flash-preview", { contextWindow: 1_048_576 }),
    reasoningModel("gemini-2.5-pro", { contextWindow: 1_048_576 }),
  ]),
  provider("amazon-bedrock", "apiKey", [
    reasoningModel("anthropic.claude-sonnet-4-6", { contextWindow: 1_000_000 }),
    reasoningModel("anthropic.claude-opus-4-8", { contextWindow: 1_000_000 }),
    m("amazon.nova-pro-v1:0", { contextWindow: 300_000 }),
    m("amazon.nova-lite-v1:0", { contextWindow: 300_000 }),
  ]),
  provider("minimax", "apiKey", [
    reasoningModel("MiniMax-M3.1-Flash", { contextWindow: 1_000_000 }),
    reasoningModel("MiniMax-M3", { contextWindow: 512_000 }),
    reasoningModel("MiniMax-M2.7", { contextWindow: 204_800 }),
    reasoningModel("MiniMax-M2.7-highspeed", { contextWindow: 204_800 }),
  ]),
  provider(
    "groq",
    "apiKey",
    [
      reasoningModel("llama-4-scout", { contextWindow: 131_072, vision: true }),
      m("llama-3.3-70b", { contextWindow: 131_072 }),
    ],
    "Groq",
  ),
];
