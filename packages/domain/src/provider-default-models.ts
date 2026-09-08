/**
 * The ONE default model per provider, keyed by pi's CANONICAL provider id.
 *
 * This is the single value behind three questions that used to be answered by
 * three drifting tables: what the picker pre-selects the moment a provider
 * connects (the app's catalog `defaultModel`), what a turn pinned to a provider
 * with no model runs on (the runtime's env defaults), and where a migration
 * lands a stored model it cannot place (`provider-model.ts`). They disagreed —
 * Anthropic read `claude-sonnet-5` in the app and the runtime but
 * `claude-sonnet-4-6` here, and this table is the one that REWRITES user data.
 *
 * `Partial` because `ProviderId` is open (any pi-ai id): a provider absent from
 * this table has no catalog default, and readers must handle the missing key
 * (see `provider-model.ts` `defaultModelFor`, and the app catalog's fallback to
 * the provider's first pi model) rather than assume a value. A cross-provider
 * guess is the exact bug this table exists to prevent.
 *
 * A dependency-free LEAF (see `provider-dialect.ts`): exposed as the
 * `@houston/domain/provider-default-models` subpath so the app catalog reads
 * these values instead of restating them.
 */

import type { ProviderId } from "./provider-ids";

export const DEFAULT_MODEL: Partial<Record<ProviderId, string>> = {
  anthropic: "claude-sonnet-5",
  // Codex's current full tier, and the id a pin naming `openai-codex` with NO
  // model lands on. gpt-5.5 held this slot after OpenAI stopped serving it to
  // ChatGPT subscriptions, so every such pin died `model_not_found` on its
  // first turn. The runtime states this id a second time as
  // `CODEX_DEFAULT_MODEL` (packages/runtime/src/ai/codex-offered.ts), where the
  // live probe that proves it lives; `app/tests/codex-models.test.ts` pins the
  // two together so the copy cannot drift silently.
  "openai-codex": "gpt-6-astra",
  // The cheapest model served on every Copilot plan (HOU-578). GitHub retired
  // gpt-4.1, the old base model, on 2026-06-01 (pi dropped it in 0.85.0); under
  // usage-based billing every model spends AI credits, so the default is the
  // lowest-cost row rather than a "free" one. Copilot uses DOTTED model ids,
  // unlike native Anthropic.
  "github-copilot": "gpt-5-mini",
  opencode: "claude-sonnet-4-6",
  "opencode-go": "glm-5.1",
  openrouter: "anthropic/claude-sonnet-4.6",
  deepseek: "deepseek-v4-flash",
  // 3.8 Flash (GA 2026-09-02): 1M context, 64K output, and cheaper than 3.5
  // Flash while scoring higher. Also the key-verify probe model.
  google: "gemini-3.8-flash",
  // Inference-profile id (`global.`), NOT the bare foundation id: Bedrock
  // serves Claude 4.x only through inference profiles, so bare-id invocation
  // (including the connect-time key probe) fails with "on-demand throughput
  // isn't supported" (PRODUCT-1477).
  "amazon-bedrock": "global.anthropic.claude-sonnet-4-6",
  // The token/coding-plan SKU (1M context) — see runtime `ai/minimax.ts`. A
  // subscription key run on bare MiniMax-M3 reads as "usage ran out" (HOU-1160).
  minimax: "MiniMax-M3[1m]",
  // NVIDIA serves each hosted model per ACCOUNT (HOU-890), so pi's
  // alphabetically-first rows (gemma, deepseek) answer `404 Function not found
  // for account` for many accounts — and the default is what the key VERIFIER
  // probes, so a dead pick breaks connect itself. openai/gpt-oss-20b is the last
  // survivor of the families our partially-gated live key was served (NVIDIA
  // retired the llama-3.x NIM rows in pi 0.84.4 and gpt-oss-120b in 0.85.0).
  // Keep in sync with the runtime classifier's NVIDIA_BROAD_FALLBACK and the
  // verifier's NVIDIA_VERIFY_FALLBACKS.
  nvidia: "openai/gpt-oss-20b",
  // pi lists Alibaba's multi-vendor Token Plan catalogs alphabetically, which
  // would make MiniMax the default on a card named Qwen.
  qwen: "qwen3.7-max",
  "qwen-token-plan": "qwen3.7-max",
  "qwen-token-plan-individual": "qwen3.7-max",
  // Moonshot's own migration target for the retired kimi-k2 previews. Unlocked
  // by the same >= $1 first top-up Moonshot requires before any request works,
  // so every account that can chat has it (PRODUCT-1411).
  moonshotai: "kimi-k3",
  // pi's azure catalog is alphabetical (gpt-4 first) — start current. The Codex
  // backend's refusal of gpt-5.5 does not reach here: an Azure request hits the
  // user's own resource and runs whatever they deployed.
  "azure-openai-responses": "gpt-5.5",
  // No catalog default — the model is whatever the user's local server serves.
  "openai-compatible": "",
};
