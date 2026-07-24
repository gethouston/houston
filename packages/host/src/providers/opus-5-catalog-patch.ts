import type { Model } from "@earendil-works/pi-ai";
import { ANTHROPIC_MODELS } from "@earendil-works/pi-ai/providers/anthropic.models";

/**
 * Backport Claude Opus 5 into pi-ai 0.80.6's baked Anthropic catalog, so
 * `GET /v1/catalog` advertises it and the picker can offer it. Opus 5 shipped
 * after 0.80.6 was cut; the pi bump carrying it is blocked behind the same
 * 0.80.7+ AuthStorage migration as the Kimi K3 backport.
 *
 * The entry mirrors 0.80.6's own `claude-opus-4-8` — Opus 5 is a drop-in at
 * that tier. Idempotent. The runtime has a twin (packages/runtime/src/ai/
 * opus-5-catalog-patch.ts) — DELETE BOTH when the pi bump lands.
 */
const CLAUDE_OPUS_5: Model<"anthropic-messages"> = {
  id: "claude-opus-5",
  name: "Claude Opus 5",
  api: "anthropic-messages",
  provider: "anthropic",
  baseUrl: "https://api.anthropic.com",
  compat: {
    forceAdaptiveThinking: true,
    supportsTemperature: false,
  },
  reasoning: true,
  thinkingLevelMap: {
    xhigh: "xhigh",
    max: "max",
  },
  input: ["text", "image"],
  cost: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  contextWindow: 1_000_000,
  maxTokens: 128_000,
} as Model<"anthropic-messages">;

export function ensureAnthropicOpus5(): void {
  const table = ANTHROPIC_MODELS as Record<string, Model<"anthropic-messages">>;
  if (!table[CLAUDE_OPUS_5.id]) table[CLAUDE_OPUS_5.id] = CLAUDE_OPUS_5;
}

ensureAnthropicOpus5();
