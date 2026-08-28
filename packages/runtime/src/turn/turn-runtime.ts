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

const TURN_RUNTIME_INPUTS = new Set([
  "azure-endpoint.json",
  "custom-endpoint.json",
  "models.json",
  // Read by pi, not by this repo: ModelRuntime.create's offline refresh loads
  // stored dynamic models through its FileModelsStore at
  // dirname(modelsPath)/models-store.json. Left to the bulk pass, that read
  // races an in-flight download and can parse a partial file.
  "models-store.json",
  "qwen-region.json",
  "settings.json",
  "xiaomi-endpoint.json",
]);

/** Files that model construction reads before the full tree is hydrated. */
export function turnRuntimeInputIncludes(
  dataRel: string,
  relativePath: string,
): boolean {
  const prefix = `${dataRel}/`;
  return (
    relativePath.startsWith(prefix) &&
    TURN_RUNTIME_INPUTS.has(relativePath.slice(prefix.length))
  );
}

/** Inputs that must land before hot-set admission and model startup. */
export function turnHydrationPriorityIncludes(
  dataRel: string | undefined,
  relativePath: string,
  needsClaudePointer: boolean,
): boolean {
  if (needsClaudePointer && relativePath.endsWith("/claude/sessions.json")) {
    return true;
  }
  return (
    dataRel !== undefined && turnRuntimeInputIncludes(dataRel, relativePath)
  );
}

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
