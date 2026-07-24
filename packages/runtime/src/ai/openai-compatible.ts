import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { config } from "../config";

/**
 * The OpenAI-compatible (custom endpoint) provider: a server the user points at
 * by base URL + model id (a local Ollama/vLLM/LM Studio, or a reachable remote).
 * Kept out of `providers.ts` so the general registry stays focused. The endpoint
 * persists to its own `custom-endpoint.json`; the optional API key lives in
 * auth.json (pi's `api_key` variant, a placeholder for a keyless server).
 */

/**
 * The provider id — the SAME string the built model carries (`model.provider`)
 * AND the auth-store key the (optional, placeholder-for-keyless) API key is
 * stored under, since pi resolves a request's key by `model.provider`. A plain
 * string (not the `ProviderId` union) to avoid a cycle with `providers.ts`.
 */
export const OPENAI_COMPATIBLE = "openai-compatible";

/** Default ceiling on a local model's output tokens — well under any window. */
const CUSTOM_MAX_TOKENS = 4096;

/** The persisted endpoint (sans key). */
interface StoredEndpoint {
  baseUrl?: string;
  model?: string;
  name?: string;
  contextWindow?: number;
  reasoning?: boolean;
  orgShared?: boolean;
}

/** The endpoint config's on-disk path — exported so credential-health can
 *  fingerprint the file (a reconfigured endpoint must heal a failure mark). */
export const endpointFileIn = (dataDir: string) =>
  join(dataDir, "custom-endpoint.json");

/**
 * Read the stored endpoint. `dataDir` defaults to the live agent's; the per-turn
 * cloud runtime passes its throwaway hydrated root, since each turn materializes
 * `custom-endpoint.json` into its OWN dir (turn-session.ts), not `config.dataDir`.
 */
function load(dataDir: string = config.dataDir): StoredEndpoint {
  const file = endpointFileIn(dataDir);
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8")) as StoredEndpoint;
  } catch {
    return {};
  }
}

function save(e: StoredEndpoint): void {
  const file = endpointFileIn(config.dataDir);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(e, null, 2));
  renameSync(tmp, file);
  // Every endpoint write re-syncs the live runtime's provider registration —
  // no caller can configure an endpoint the runtime then can't dispatch to.
  if (liveRegistrar) registerCustomProviderIfConfigured(liveRegistrar);
}

/** True when a base URL + model are configured (NOT merely that a key exists). */
export function customEndpointConfigured(dataDir?: string): boolean {
  const e = load(dataDir);
  return !!(e.baseUrl && e.model);
}

export interface CustomEndpointStatus {
  configured: boolean;
  orgShared: boolean;
  endpoint?: OpenAiCompatibleEndpoint;
}

/** Internal host sync status. Never includes the endpoint API key. */
export function customEndpointStatus(dataDir?: string): CustomEndpointStatus {
  const endpoint = load(dataDir);
  if (!endpoint.baseUrl || !endpoint.model) {
    return { configured: false, orgShared: false };
  }
  return {
    configured: true,
    orgShared: endpoint.orgShared === true,
    endpoint: {
      baseUrl: endpoint.baseUrl,
      model: endpoint.model,
      ...(endpoint.name !== undefined ? { name: endpoint.name } : {}),
      ...(endpoint.contextWindow !== undefined
        ? { contextWindow: endpoint.contextWindow }
        : {}),
      ...(endpoint.reasoning !== undefined
        ? { reasoning: endpoint.reasoning }
        : {}),
    },
  };
}

/** The configured model id, or "" when unset. */
export function customModelId(): string {
  return load().model ?? "";
}

/** Update only the model id (the chat picker's model switch for this provider). */
export function setCustomModelId(model: string): void {
  save({ ...load(), model });
}

/** The configured endpoint pieces a local model is built from. */
export interface OpenAiCompatibleEndpoint {
  baseUrl: string;
  model: string;
  name?: string;
  contextWindow?: number;
  reasoning?: boolean;
}

/**
 * Build a pi-ai `Model` for an OpenAI-compatible endpoint. pi has no catalog for
 * an arbitrary server, so unlike the KnownProviders this model is hand-built
 * against pi's `openai-completions` API. Pure (no fs) so the mapping is testable.
 */
export function buildOpenAiCompatibleModel(
  endpoint: OpenAiCompatibleEndpoint,
): Model<"openai-completions"> {
  const reasoning = endpoint.reasoning ?? false;
  return {
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
}

/**
 * The endpoint serves exactly its one configured model. Returns an error message
 * when a per-turn override names a DIFFERENT model (e.g. a routine pin carrying
 * ANOTHER provider's id while this provider is active) — shipping it to the base
 * URL would draw a confusing upstream `model_not_supported`. Null when the
 * override is absent or matches. Pure, so the guard is unit-testable.
 */
export function localOverrideError(
  configured: string,
  override: string | undefined,
): string | null {
  return override && override !== configured
    ? `The local endpoint serves "${configured}", not "${override}". Pick the local model (or switch the active provider) before this turn.`
    : null;
}

/**
 * Build the active local model from the saved endpoint. The optional `override`
 * (a routine's pinned model) wins over the saved model id; throws when nothing is
 * configured so a never-connected turn surfaces a clear error. `dataDir` defaults
 * to the live agent's; the per-turn runtime passes its hydrated root.
 */
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
    baseUrl: e.baseUrl,
    model: e.model,
    name: e.name,
    contextWindow: e.contextWindow,
    reasoning: e.reasoning,
  }) as Model<Api>;
}

/** Inputs to configure the OpenAI-compatible (local) endpoint. */
export interface CustomEndpointInput {
  baseUrl: string;
  model: string;
  name?: string;
  contextWindow?: number;
  reasoning?: boolean;
  /** Internal marker for endpoints hydrated from the organization share. */
  orgShared?: boolean;
}

/**
 * Persist the endpoint (base URL + model + display options). Validates the base
 * URL is a real http(s) URL — a typo here is the most common failure for a local
 * server, so reject it at connect time rather than as a cryptic turn error. The
 * API key is handled separately (auth/login.ts), since it belongs in auth.json.
 */
export function setCustomEndpointConfig(input: CustomEndpointInput): void {
  const baseUrl = input.baseUrl?.trim();
  const model = input.model?.trim();
  if (!baseUrl) throw new Error("missing base URL");
  if (!model) throw new Error("missing model");
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(`base URL is not a valid URL: ${baseUrl}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("base URL must start with http:// or https://");
  save({
    baseUrl,
    model,
    name: input.name?.trim() || undefined,
    contextWindow:
      typeof input.contextWindow === "number" && input.contextWindow > 0
        ? Math.floor(input.contextWindow)
        : undefined,
    reasoning: input.reasoning ?? undefined,
    orgShared: input.orgShared === true ? true : undefined,
  });
}

/** Forget the endpoint (its key is cleared by auth logout). */
export function clearCustomEndpointConfig(): void {
  save({});
}

/** The slice of `ModelRuntime` provider registration takes (test-injectable). */
export type CustomProviderRegistrar = Pick<
  ModelRuntime,
  "registerProvider" | "unregisterProvider" | "getRegisteredProviderConfig"
>;

/** The long-lived runtime `save()` re-syncs on every endpoint write. */
let liveRegistrar: CustomProviderRegistrar | undefined;

/**
 * Bind the process's long-lived runtime (auth/storage.ts, at boot) so every
 * later endpoint write keeps its provider registration in sync. Also syncs
 * immediately, covering an endpoint already on disk at boot.
 */
export function bindCustomProviderRegistrar(
  runtime: CustomProviderRegistrar,
): void {
  liveRegistrar = runtime;
  registerCustomProviderIfConfigured(runtime);
}

/**
 * Register (or drop) the `openai-compatible` provider on a runtime to match
 * the stored endpoint config. pi 0.82 dispatches every stream strictly by
 * REGISTERED provider id (`Models.requireProvider`), so the hand-built local
 * model only runs when its provider id is registered — the old global
 * api-registry fallback is gone. The model object still carries the live
 * baseUrl per turn (`buildActiveCustomModel`), so registration only needs to
 * exist and name the api; a stale registered baseUrl is never dialed.
 *
 * Called at boot (auth/storage.ts, the live runtime), after connect/disconnect
 * (auth/login.ts), and per-turn for the throwaway cloud runtime
 * (turn/turn-session.ts, with its hydrated dataDir).
 */
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
    });
  } else if (runtime.getRegisteredProviderConfig(OPENAI_COMPATIBLE)) {
    runtime.unregisterProvider(OPENAI_COMPATIBLE);
  }
}

/**
 * Learn the endpoint's REAL context window from a provider context-overflow
 * rejection (llama.cpp names its `n_ctx`). Local servers don't advertise a
 * window pi can read, so an unset endpoint runs on the assumed default
 * (`config.openaiCompatibleContextWindow`) — when that assumption is LARGER
 * than the truth, autocompact never fires and every turn past the real window
 * fails. Persisting the reported window makes the next turn's autocompact
 * divide by the truth, so the conversation compacts instead of dying.
 *
 * Only ever sets or SHRINKS the stored window: the overflow proves the real
 * window is at most `windowTokens`, but a report can't prove a LARGER window
 * (and must never silently raise a value the user set deliberately). Returns
 * whether anything was written.
 */
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
