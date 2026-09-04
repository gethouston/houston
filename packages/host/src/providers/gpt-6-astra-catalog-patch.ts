import type { Model } from "@earendil-works/pi-ai";
import { AZURE_OPENAI_RESPONSES_MODELS } from "@earendil-works/pi-ai/providers/azure-openai-responses.models";
import { OPENAI_CODEX_MODELS } from "@earendil-works/pi-ai/providers/openai-codex.models";

/**
 * Backport GPT-6 Astra into pi-ai 0.85.0's baked OpenAI catalogs, so the
 * `openai-codex` (ChatGPT subscription) and `azure-openai-responses` providers
 * offer it and a turn can run on it. Astra shipped 2026-09-03, after 0.85.0
 * was cut, so the current pin does not carry it.
 *
 * Each entry mirrors 0.85.0's own `gpt-5.6-sol` on the same provider — Astra
 * is the next frontier tier above Sol, same 1.05M/128k shape, same effort
 * ladder (low→max; `none` is rejected by the API, hence no `off`) — with the
 * launch price: $10/$50 per MTok ($1 cache read, $12.50 cache write), doubling
 * to $20/$75 above 272k input tokens. Verified against OpenAI's model page,
 * Azure's reasoning-models doc, and models.dev. Idempotent. The runtime has a
 * twin (packages/runtime/src/ai/gpt-6-astra-catalog-patch.ts) — DELETE BOTH
 * when a pi bump ships it natively, the way the 0.85.0 bump retired the Fable
 * 5.1 patch.
 */
const ASTRA_COST = {
  input: 10,
  output: 50,
  cacheRead: 1,
  cacheWrite: 12.5,
  tiers: [
    {
      inputTokensAbove: 272_000,
      input: 20,
      output: 75,
      cacheRead: 2,
      cacheWrite: 25,
    },
  ],
};

const GPT_6_ASTRA_CODEX: Model<"openai-codex-responses"> = {
  id: "gpt-6-astra",
  name: "GPT-6 Astra",
  api: "openai-codex-responses",
  provider: "openai-codex",
  baseUrl: "https://chatgpt.com/backend-api",
  reasoning: true,
  input: ["text", "image"],
  cost: ASTRA_COST,
  // 272k is the standard-price tier Codex sizes against (same as gpt-5.5 /
  // gpt-5.6-sol here); the protocol's MODEL_WINDOW_OVERRIDES snaps the usage
  // bar up to the 1M window once observed usage proves it.
  contextWindow: 272_000,
  maxTokens: 128_000,
  thinkingLevelMap: { xhigh: "xhigh", max: "max", minimal: "low" },
  compat: {
    supportsOpenAIGrammarTools: true,
    supportsAdditionalTools: true,
    supportsToolSearch: true,
  },
} as Model<"openai-codex-responses">;

const GPT_6_ASTRA_AZURE: Model<"azure-openai-responses"> = {
  id: "gpt-6-astra",
  name: "GPT-6 Astra",
  api: "azure-openai-responses",
  provider: "azure-openai-responses",
  baseUrl: "",
  reasoning: true,
  input: ["text", "image"],
  cost: { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
  contextWindow: 1_050_000,
  maxTokens: 128_000,
  thinkingLevelMap: { off: null, xhigh: "xhigh", max: "max" },
  compat: { supportsOpenAIGrammarTools: true },
} as Model<"azure-openai-responses">;

export function ensureGpt6Astra(): void {
  const codex = OPENAI_CODEX_MODELS as Record<
    string,
    Model<"openai-codex-responses">
  >;
  if (!codex[GPT_6_ASTRA_CODEX.id])
    codex[GPT_6_ASTRA_CODEX.id] = GPT_6_ASTRA_CODEX;
  const azure = AZURE_OPENAI_RESPONSES_MODELS as Record<
    string,
    Model<"azure-openai-responses">
  >;
  if (!azure[GPT_6_ASTRA_AZURE.id])
    azure[GPT_6_ASTRA_AZURE.id] = GPT_6_ASTRA_AZURE;
}

ensureGpt6Astra();
