import type { Model } from "@earendil-works/pi-ai";
import { ANTHROPIC_MODELS } from "@earendil-works/pi-ai/providers/anthropic.models";

/**
 * Backport Claude Fable 5.1 into pi-ai 0.84.4's baked Anthropic catalog, so
 * the `anthropic` provider offers it and a turn can run on it. Fable 5.1
 * shipped 2026-09-01, after 0.84.4 was cut, so the current pin does not
 * carry it.
 *
 * The entry mirrors 0.84.4's own `claude-fable-5` — Fable 5.1 is its drop-in
 * successor at the same tier and per-token price; only cache reads got cheaper
 * ($0.25/MTok, down from $1). Idempotent. The host has a twin
 * (packages/host/src/providers/fable-5-1-catalog-patch.ts) — DELETE BOTH when a pi
 * bump ships it natively, the way the 0.82.1 bump retired the Opus 5 patch.
 */
const CLAUDE_FABLE_5_1: Model<"anthropic-messages"> = {
  id: "claude-fable-5-1",
  name: "Claude Fable 5.1",
  api: "anthropic-messages",
  provider: "anthropic",
  baseUrl: "https://api.anthropic.com",
  compat: {
    forceAdaptiveThinking: true,
    supportsStrictTools: true,
    allowedFallbackModels: [
      {
        provider: "anthropic",
        model: "claude-opus-4-8",
        cost: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
      },
      {
        provider: "anthropic",
        model: "claude-opus-5",
        cost: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
      },
    ],
  },
  reasoning: true,
  thinkingLevelMap: {
    off: null,
    xhigh: "xhigh",
    max: "max",
  },
  input: ["text", "image"],
  cost: { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
  contextWindow: 1_000_000,
  maxTokens: 128_000,
} as Model<"anthropic-messages">;

export function ensureAnthropicFable51(): void {
  const table = ANTHROPIC_MODELS as Record<string, Model<"anthropic-messages">>;
  if (!table[CLAUDE_FABLE_5_1.id])
    table[CLAUDE_FABLE_5_1.id] = CLAUDE_FABLE_5_1;
}

ensureAnthropicFable51();
