import type { Model } from "@earendil-works/pi-ai";
import { ANTHROPIC_MODELS } from "@earendil-works/pi-ai/providers/anthropic.models";

/**
 * Backport Claude Opus 5 into pi-ai 0.82.0's baked Anthropic catalog, so the
 * `anthropic` provider offers it and a turn can run on it. Opus 5 shipped
 * 2026-07-24, after 0.82.0 was cut, so the current pin does not carry it.
 *
 * The entry mirrors 0.82.0's own `claude-opus-4-8` — Opus 5 is a drop-in at
 * that tier. Idempotent. The host has a twin (packages/host/src/providers/
 * opus-5-catalog-patch.ts) — DELETE BOTH when a pi bump ships it natively, the
 * way the 0.82 bump retired the gemini-flash and moonshot-k3 patches.
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
