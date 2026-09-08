import type { Api, Model } from "@earendil-works/pi-ai";
import { ManagedBridgeEndpointSchema } from "@houston/protocol";
import { config } from "../config";
import { load, type OpenAiCompatibleEndpoint } from "./openai-compatible-store";
export const OPENAI_COMPATIBLE = "openai-compatible";
const CUSTOM_MAX_TOKENS = 4096;
const managedModels = new WeakSet<object>();
export function isManagedBridgeModel(model: unknown): boolean {
  return (
    typeof model === "object" && model !== null && managedModels.has(model)
  );
}
export function buildOpenAiCompatibleModel(
  endpoint: OpenAiCompatibleEndpoint,
): Model<"openai-completions"> {
  const reasoning = endpoint.reasoning ?? false;
  const model: Model<"openai-completions"> = {
    id: endpoint.model,
    name: endpoint.name || endpoint.model,
    api: "openai-completions",
    provider: OPENAI_COMPATIBLE,
    baseUrl: endpoint.baseUrl,
    reasoning,
    input: ["text"],
    // Local inference is free; a zero cost keeps the usage meter honest.
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow:
      endpoint.contextWindow ?? config.openaiCompatibleContextWindow,
    maxTokens: CUSTOM_MAX_TOKENS,
    // Servers implement varying subsets of the OpenAI API. Disable the OpenAI-only
    // extras most reject (`developer` role, `reasoning_effort`) unless reasoning.
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: reasoning,
    },
  };
  if (endpoint.bridge) managedModels.add(model);
  return model;
}

export function localOverrideError(
  configured: string,
  override: string | undefined,
): string | null {
  return override && override !== configured
    ? `The local endpoint serves "${configured}", not "${override}". Pick the local model (or switch the active provider) before this turn.`
    : null;
}

export function buildActiveCustomModel(
  override?: string,
  dataDir?: string,
): Model<Api> {
  const e = load(dataDir);
  if (!e.baseUrl || !e.model)
    throw new Error(
      "No local model configured. Set a base URL and model for the OpenAI-compatible provider.",
    );
  const mismatch = localOverrideError(e.model, override);
  if (mismatch) throw new Error(mismatch);
  return buildOpenAiCompatibleModel({
    ...(e.bridge
      ? { bridge: ManagedBridgeEndpointSchema.parse(e.bridge) }
      : {}),
    baseUrl: e.baseUrl,
    model: e.model,
    name: e.name,
    contextWindow: e.contextWindow,
    reasoning: e.reasoning,
  }) as Model<Api>;
}
