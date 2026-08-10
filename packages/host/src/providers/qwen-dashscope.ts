import type { Model } from "@earendil-works/pi-ai";
import { QWEN_TOKEN_PLAN_MODELS } from "@earendil-works/pi-ai/providers/qwen-token-plan.models";

/**
 * Host twin of the runtime's qwen extension provider
 * (`packages/runtime/src/ai/qwen-dashscope.ts` — the full story lives there):
 * Qwen models on Alibaba Model Studio's INTERNATIONAL pay-as-you-go endpoint
 * (DashScope), for the regular free-quota keys the pi-shipped Token Plan
 * gateways reject with a 401 (HOU-1077). Host and runtime are separate
 * packages (the host must not import `@houston/runtime`), so the ~30-line
 * derivation is duplicated deliberately, exactly like the retired
 * moonshot-k3 catalog patch twins were. Both twins derive from the SAME pi
 * `qwen-token-plan` table, so they cannot drift from each other or from pi.
 *
 * The host's stake: `GET /v1/catalog` must advertise the provider
 * (pi-catalog.ts appends it) and the api-key connect route must accept it
 * (providers/api-key.ts includes the id). Delete both twins when pi-ai ships
 * a DashScope provider natively.
 */

export const QWEN_PROVIDER_ID = "qwen";

export const QWEN_BASE_URL =
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

/** The default model, listed FIRST so every first-model read picks it. */
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
