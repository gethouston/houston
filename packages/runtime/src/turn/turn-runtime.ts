import { join } from "node:path";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import {
  type CustomProviderRegistrar,
  registerCustomProviderIfConfigured,
} from "../ai/openai-compatible";
import {
  ensureQwenRuntimeProvider,
  type QwenProviderRegistrar,
} from "../ai/qwen-dashscope";
import { resolveTurnModel } from "./turn-model";

/** Build and resolve the isolated model runtime for one hydrated turn root. */
export async function createTurnModelRuntime(
  dataDir: string,
  provider: string,
  modelOverride?: string | null,
  timings?: Record<string, number>,
) {
  const modelRuntime = await ModelRuntime.create({
    authPath: join(dataDir, "auth.json"),
    modelsPath: join(dataDir, "models.json"),
  });
  registerTurnProviders(modelRuntime, dataDir);
  if (timings) timings.t_model_runtime = performance.now();
  const model = resolveTurnModel(dataDir, provider, modelOverride);
  if (timings) timings.t_model_resolved = performance.now();
  return { modelRuntime, model };
}

/** Register every data-dir-sensitive provider against a turn-local root. */
export function registerTurnProviders(
  runtime: CustomProviderRegistrar & QwenProviderRegistrar,
  dataDir: string,
): void {
  registerCustomProviderIfConfigured(runtime, dataDir);
  ensureQwenRuntimeProvider(runtime, dataDir);
}
