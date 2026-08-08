import type { Model } from "@earendil-works/pi-ai";
import { QWEN_TOKEN_PLAN_MODELS } from "@earendil-works/pi-ai/providers/qwen-token-plan.models";

/**
 * Houston's `qwen` extension provider: Qwen models on Alibaba Model Studio's
 * INTERNATIONAL pay-as-you-go endpoint (DashScope, OpenAI-compatible). pi-ai
 * ships only the Token Plan gateways (`qwen-token-plan`, `qwen-token-plan-cn`),
 * whose endpoint rejects every key but the dedicated one minted after
 * purchasing a plan — a regular (free-quota) Model Studio key gets a 401
 * (HOU-1077). This provider is the home for those regular keys.
 *
 * The model list is DERIVED from pi's own `qwen-token-plan` catalog (the same
 * Model Studio catalog backs both products) — Qwen-family entries only, with
 * the provider id and base URL remapped — so a pi bump that updates Qwen
 * models updates this provider in lockstep, and the compat/thinking flags can
 * never drift from pi's. Cost fields carry over as pi ships them
 * (plan-priced zeros today; presentation-only).
 *
 * Delete this module (and its host twin, `packages/host/src/providers/
 * qwen-dashscope.ts`) when pi-ai ships a DashScope provider natively.
 *
 * pi-ai has no registry hook for a NEW provider id (its `MODELS` table is not
 * exported), so the extension threads through Houston's own catalog seams
 * instead of a monkey-patch: `pi-catalog.ts` (provider/model ids),
 * `providers.ts` `safeGetModel` (model resolution), and `ModelRuntime.
 * registerProvider` (stream dispatch + stored-key auth — the same mechanism
 * the local OpenAI-compatible provider uses).
 */

export const QWEN_PROVIDER_ID = "qwen";

export const QWEN_BASE_URL =
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

/** The default model, listed FIRST so `firstCatalogModel` picks it. */
const QWEN_DEFAULT_MODEL = "qwen3.7-max";

let cached: Model<"openai-completions">[] | undefined;

/** The provider's models: pi's Token Plan Qwen entries on the DashScope URL. */
export function qwenModels(): Model<"openai-completions">[] {
  if (!cached) {
    const qwen = Object.values(
      QWEN_TOKEN_PLAN_MODELS as Record<string, Model<"openai-completions">>,
    )
      .filter((m) => m.id.startsWith("qwen"))
      .map((m) => ({
        ...m,
        provider: QWEN_PROVIDER_ID,
        baseUrl: QWEN_BASE_URL,
      }));
    cached = [
      ...qwen.filter((m) => m.id === QWEN_DEFAULT_MODEL),
      ...qwen.filter((m) => m.id !== QWEN_DEFAULT_MODEL),
    ];
  }
  return cached;
}

/** Model lookup, `undefined` for an id the provider doesn't offer. */
export function qwenModel(id: string): Model<"openai-completions"> | undefined {
  return qwenModels().find((m) => m.id === id);
}

/**
 * The slice of `ModelRuntime` this registration takes (mirrors
 * `CustomProviderRegistrar` in ./openai-compatible — test-injectable).
 */
export interface QwenProviderRegistrar {
  registerProvider(
    providerId: string,
    config: {
      name?: string;
      baseUrl?: string;
      api?: "openai-completions";
      models?: Model<"openai-completions">[];
    },
  ): void;
}

/**
 * Register the provider on a runtime so pi can dispatch its streams (pi 0.82
 * dispatches strictly by registered provider id) and resolve its stored API
 * key (HoustonAuthStore, keyed by provider id — the same path the local
 * provider's key rides). Called at boot for the long-lived runtime
 * (auth/storage.ts) and per-turn for the throwaway cloud runtime
 * (turn/turn-session.ts).
 */
export function ensureQwenRuntimeProvider(
  runtime: QwenProviderRegistrar,
): void {
  runtime.registerProvider(QWEN_PROVIDER_ID, {
    name: "Qwen",
    baseUrl: QWEN_BASE_URL,
    api: "openai-completions",
    models: qwenModels(),
  });
}
