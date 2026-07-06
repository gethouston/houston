import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
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
}

const endpointFileIn = (dataDir: string) =>
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
}

/** True when a base URL + model are configured (NOT merely that a key exists). */
export function customEndpointConfigured(dataDir?: string): boolean {
  const e = load(dataDir);
  return !!(e.baseUrl && e.model);
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
  });
}

/** Forget the endpoint (its key is cleared by auth logout). */
export function clearCustomEndpointConfig(): void {
  save({});
}
