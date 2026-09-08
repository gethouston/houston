import type { Model } from "@earendil-works/pi-ai";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { ManagedBridgeEndpointSchema } from "@houston/protocol";
import { config } from "../config";
import { streamBridge } from "./local-model-transport";
import { OPENAI_COMPATIBLE } from "./openai-compatible-model";
import {
  type CustomEndpointInput,
  load,
  normalizeEndpointInput,
  type StoredEndpoint,
  writeEndpointFileIn,
} from "./openai-compatible-store";

export {
  buildActiveCustomModel,
  buildOpenAiCompatibleModel,
  localOverrideError,
  OPENAI_COMPATIBLE,
} from "./openai-compatible-model";
export {
  type CustomEndpointInput,
  type CustomEndpointStatus,
  customEndpointConfigured,
  customEndpointStatus,
  endpointFileIn,
  type OpenAiCompatibleEndpoint,
} from "./openai-compatible-store";

function save(e: StoredEndpoint): void {
  writeEndpointFileIn(config.dataDir, e);
  // Every endpoint write re-syncs the live runtime's provider registration —
  // no caller can configure an endpoint the runtime then can't dispatch to.
  if (liveRegistrar) registerCustomProviderIfConfigured(liveRegistrar);
}

export function customModelId(): string {
  return load().model ?? "";
}

export function setCustomModelId(model: string): void {
  save({ ...load(), model });
}

export function setCustomEndpointConfig(input: CustomEndpointInput): void {
  save(normalizeEndpointInput(input));
}

export function setCustomEndpointConfigIn(
  dataDir: string,
  input: CustomEndpointInput,
): void {
  writeEndpointFileIn(dataDir, normalizeEndpointInput(input));
}

export function clearCustomEndpointConfig(): void {
  save({});
}

export type CustomProviderRegistrar = Pick<
  ModelRuntime,
  "registerProvider" | "unregisterProvider" | "getRegisteredProviderConfig"
>;

let liveRegistrar: CustomProviderRegistrar | undefined;

export function bindCustomProviderRegistrar(
  runtime: CustomProviderRegistrar,
): void {
  liveRegistrar = runtime;
  registerCustomProviderIfConfigured(runtime);
}

export function registerCustomProviderIfConfigured(
  runtime: CustomProviderRegistrar,
  dataDir?: string,
): void {
  const e = load(dataDir);
  if (e.baseUrl && e.model) {
    runtime.registerProvider(OPENAI_COMPATIBLE, {
      name: e.name || "Local model (OpenAI-compatible)",
      baseUrl: e.baseUrl,
      api: "openai-completions",
      models: [],
      ...(e.bridge
        ? {
            streamSimple: (model, context, options) =>
              streamBridge(
                ManagedBridgeEndpointSchema.parse(e.bridge),
                model as Model<"openai-completions">,
                context,
                options,
              ),
          }
        : {}),
    });
  } else if (runtime.getRegisteredProviderConfig(OPENAI_COMPATIBLE)) {
    runtime.unregisterProvider(OPENAI_COMPATIBLE);
  }
}

export function learnCustomContextWindow(windowTokens: number): boolean {
  if (!Number.isInteger(windowTokens) || windowTokens <= 0) return false;
  const e = load();
  if (!e.baseUrl || !e.model) return false;
  const stored = e.contextWindow ?? config.openaiCompatibleContextWindow;
  if (stored <= windowTokens) return false;
  save({ ...e, contextWindow: windowTokens });
  console.log(
    `[custom-endpoint] learned context window ${windowTokens} for ${e.model} (was assuming ${stored})`,
  );
  return true;
}
