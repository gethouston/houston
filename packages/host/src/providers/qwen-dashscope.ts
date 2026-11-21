import type { Model } from "@earendil-works/pi-ai";
import { QWEN_TOKEN_PLAN_MODELS } from "@earendil-works/pi-ai/providers/qwen-token-plan.models";

export const QWEN_PROVIDER_ID = "qwen";

export const QWEN_BASE_URL =
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

const QWEN_DEFAULT_MODEL = "qwen3.7-max";

let cached: Model<"openai-completions">[] | undefined;

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
