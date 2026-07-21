import type { Model } from "@earendil-works/pi-ai";
import { KIMI_CODING_MODELS } from "@earendil-works/pi-ai/providers/kimi-coding.models";

/**
 * Backport Kimi K3 into pi-ai 0.80.6's baked catalog, so `GET /v1/catalog`
 * advertises it and the picker can offer it.
 *
 * pi-ai ships K3 natively from 0.80.9, but 0.80.7+ also replaced the
 * AuthStorage API pi-coding-agent and the runtime are built on, so the
 * lockstep bump is a real migration. Until it lands, inject the model into
 * the mutable `KIMI_CODING_MODELS` table (the `MODELS` registry holds it by
 * reference, so `getModel`/`getModels` and every catalog read see it). The
 * entry is copied VERBATIM from pi-ai 0.80.9.
 *
 * Idempotent: a no-op once pi-ai serves k3 natively. The runtime has a twin
 * (packages/runtime/src/ai/kimi-k3-catalog-patch.ts) because host and
 * runtime are separate processes — DELETE BOTH when the pi bump lands.
 */
const KIMI_K3: Model<"anthropic-messages"> = {
  id: "k3",
  name: "Kimi K3",
  api: "anthropic-messages",
  provider: "kimi-coding",
  baseUrl: "https://api.kimi.com/coding",
  headers: { "User-Agent": "KimiCLI/1.5" },
  compat: { allowEmptySignature: true, forceAdaptiveThinking: true },
  reasoning: true,
  thinkingLevelMap: {
    off: null,
    minimal: null,
    low: null,
    medium: null,
    high: null,
    xhigh: null,
    max: "max",
  },
  input: ["text", "image"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1048576,
  maxTokens: 131072,
} as Model<"anthropic-messages">;

export function ensureKimiK3(): void {
  const table = KIMI_CODING_MODELS as Record<
    string,
    Model<"anthropic-messages">
  >;
  if (!table[KIMI_K3.id]) table[KIMI_K3.id] = KIMI_K3;
}

ensureKimiK3();
