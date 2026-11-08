/**
 * The provider-catalog wire type (protocol v3). Response body of the host's
 * `GET /v1/catalog` route: pi-ai's FULL static, in-process model catalog — every
 * provider and every model the runtime can actually run, with the metadata the
 * frontend needs to drive the model picker and the AI Models settings tab.
 *
 * This catalog is built from pi-ai's baked registry: no network, so it is
 * identical on desktop and inside an egress-locked cloud pod.
 * The host constructs these values from typed pi-ai `Model`s, so — like every
 * other wire type here — these are plain interfaces with no runtime-schema
 * dependency; there is no untrusted upstream payload to validate.
 */

/** Per-1M-token price for a model, in US dollars (mirrors pi-ai `Model.cost`). */
export interface CatalogModelPricing {
  /** Price per 1M input (prompt) tokens. */
  input: number;
  /** Price per 1M output (completion) tokens. */
  output: number;
  /** Price per 1M cache-read tokens, when the provider prices cache reads. */
  cacheRead?: number;
  /** Price per 1M cache-write tokens, when the provider prices cache writes. */
  cacheWrite?: number;
}

/** One runnable model from pi-ai's catalog, normalized for the client. */
export interface CatalogModelEntry {
  /** Provider-native model id (the id used to select the model). */
  id: string;
  /** Human-readable display name. */
  name: string;
  pricing: CatalogModelPricing;
  /** Context window in tokens. */
  contextWindow: number;
  /** Maximum output tokens per response. */
  maxTokens: number;
  /** Extended thinking (reasoning) is supported. */
  reasoning: boolean;
  /** Input modalities include image (the model accepts vision input). */
  vision: boolean;
  /**
   * The pi thinking levels this model accepts, for the effort selector — present
   * only for reasoning models (omitted otherwise). Derived from pi-ai's own
   * `getSupportedThinkingLevels`, so it honors levels a model marks unsupported.
   */
  thinkingLevels?: string[];
  /**
   * Present only on a RETIRED row: the model id a turn on this id runs on THIS
   * provider (the `anthropic` provider runs one model per Claude family, so its
   * `claude-opus-5` row carries `runsAs: "claude-opus-5-5"`). An allowed-models
   * ceiling naming this id admits the `runsAs` model on this provider only;
   * the gateway's clamp and the app read it identically.
   */
  runsAs?: string;
}

/** One provider and its full model list. */
export interface CatalogProvider {
  /** pi-ai provider id (the same string used to select the provider). */
  id: string;
  /** Provider display name. */
  name: string;
  /** How the provider authenticates: OAuth sign-in vs a pasted API key. */
  auth: "oauth" | "apiKey";
  models: CatalogModelEntry[];
  /**
   * What the host's `start_mission` pin resolution reads for this provider
   * (host routes/missions-provider.ts), so the hosted gateway resolves a pin
   * from these values rather than a copy of the host's tables. Every provider
   * of a catalog that carries it is one the resolver knows.
   */
  pin?: CatalogProviderPin;
}

/** The pin-resolution facts of one catalog provider. */
export interface CatalogProviderPin {
  /**
   * The host's curated display name, which a pin may name the provider by and
   * a refusal lists it under. Absent for a provider the host does not curate
   * (a refusal lists it under its id).
   */
  name?: string;
  /**
   * The rows a spoken model name resolves against, in the order a bare family
   * name picks from (newest first within a family). Empty when no name of this
   * provider's models resolves.
   */
  models: CatalogSpokenModel[];
}

/** One model a spoken name resolves to. */
export interface CatalogSpokenModel {
  /** The model id a pin carries. */
  id: string;
  /** The display name a spoken phrase is matched against. */
  name: string;
}

/** The `GET /v1/catalog` response: every runnable provider, each with its models. */
export type ProviderCatalog = CatalogProvider[];
