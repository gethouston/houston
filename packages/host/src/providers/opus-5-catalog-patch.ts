import type { Model } from "@earendil-works/pi-ai";
import { ANTHROPIC_MODELS } from "@earendil-works/pi-ai/providers/anthropic.models";

/**
 * Backport Claude Opus 5 into pi-ai 0.80.6's baked Anthropic catalog, so
 * `GET /v1/catalog` advertises it and the picker can offer it.
 *
 * Opus 5 shipped 2026-07-24, after pi-ai 0.80.6 was cut, and the pi bump that
 * carries it is blocked behind the same 0.80.7+ AuthStorage migration as the
 * Kimi K3 backport. Until it lands, inject the model into the mutable
 * `ANTHROPIC_MODELS` table (the `MODELS` registry holds it by reference, so
 * `getModel`/`getModels` and every catalog read see it).
 *
 * The entry mirrors 0.80.6's own `claude-opus-4-8` — Opus 5 is a drop-in at the
 * same tier: same `anthropic-messages` api, same 1M context / 128k output, same
 * $5/$25 per MTok (cache 0.5 / 6.25), same effort ladder, and the same two
 * compat flags. `forceAdaptiveThinking` matches Opus 5 thinking on by default;
 * `supportsTemperature: false` matches the sampling parameters Opus 4.7+ removed
 * (Opus 5 still 400s on `temperature`/`top_p`/`top_k`).
 *
 * `thinkingLevelMap` is a PARTIAL override on pi's default ladder — naming only
 * `xhigh`/`max` extends the base off/minimal/low/medium/high set to the full
 * seven, which is what Houston's `deriveEffortLevels` folds into the
 * low/medium/high/xhigh effort row.
 *
 * Idempotent: a no-op once pi-ai serves claude-opus-5 natively. The runtime has
 * a twin (packages/runtime/src/ai/opus-5-catalog-patch.ts) because host and
 * runtime are separate processes — DELETE BOTH when the pi bump lands.
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
