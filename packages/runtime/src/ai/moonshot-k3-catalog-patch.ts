import type { Model } from "@earendil-works/pi-ai";
import { MOONSHOTAI_MODELS } from "@earendil-works/pi-ai/providers/moonshotai.models";

/**
 * Backport Kimi K3 into pi-ai 0.80.6's baked Moonshot AI catalog, so the
 * `moonshotai` provider offers it and a turn can run on it.
 *
 * pi-ai ships K3 natively from 0.80.9, but 0.80.7+ also replaced the
 * AuthStorage API pi-coding-agent and the runtime are built on, so the
 * lockstep bump is a real migration. Until it lands, inject the model into
 * the mutable `MOONSHOTAI_MODELS` table (the `MODELS` registry holds it by
 * reference, so `getModel`/`getModels` and every catalog read see it). The
 * entry is copied VERBATIM from pi-ai 0.80.10; every compat field it uses
 * (`requiresReasoningContentOnAssistantMessages`, `deferredToolsMode`) is
 * already implemented by 0.80.6's openai-completions api.
 *
 * Idempotent: a no-op once pi-ai serves kimi-k3 natively. The host has a twin
 * (packages/host/src/providers/moonshot-k3-catalog-patch.ts) because host and
 * runtime are separate processes — DELETE BOTH when the pi bump lands.
 */
const KIMI_K3: Model<"openai-completions"> = {
  id: "kimi-k3",
  name: "Kimi K3",
  api: "openai-completions",
  provider: "moonshotai",
  baseUrl: "https://api.moonshot.ai/v1",
  compat: {
    supportsStore: false,
    supportsDeveloperRole: false,
    supportsReasoningEffort: false,
    maxTokensField: "max_tokens",
    supportsStrictMode: false,
    thinkingFormat: "deepseek",
    requiresReasoningContentOnAssistantMessages: true,
    deferredToolsMode: "kimi",
  },
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
  cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 0 },
  contextWindow: 1048576,
  maxTokens: 131072,
} as Model<"openai-completions">;

export function ensureMoonshotKimiK3(): void {
  const table = MOONSHOTAI_MODELS as Record<
    string,
    Model<"openai-completions">
  >;
  if (!table[KIMI_K3.id]) table[KIMI_K3.id] = KIMI_K3;
}

ensureMoonshotKimiK3();
