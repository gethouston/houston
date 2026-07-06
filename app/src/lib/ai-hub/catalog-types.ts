/**
 * AI Hub catalog contracts. The hub folds every provider's model list into a
 * single directory of unique models (`CatalogModel`), each carrying the set of
 * providers that offer it (`CatalogOffer`). Built by `loadHubCatalog`.
 */

/**
 * The lab that makes a model. Derived from the data (OpenRouter `vendor/model`
 * id prefixes, models.dev `family` fields, and name heuristics), so the union
 * mirrors the labs actually present in the snapshot. `other` covers the long
 * tail (Perplexity, Microsoft, IBM, AI21, and smaller open-weight shops).
 */
export type LabId =
  | "anthropic"
  | "openai"
  | "google"
  | "meta"
  | "mistral"
  | "qwen"
  | "deepseek"
  | "xai"
  | "amazon"
  | "minimax"
  | "zai"
  | "moonshot"
  | "cohere"
  | "nvidia"
  | "other";

/** One provider's way to run a given model. */
export interface CatalogOffer {
  /** Engine gateway id (e.g. `openrouter`, `amazon-bedrock`, `anthropic`). */
  providerId: string;
  /** The provider-native model id to select. */
  modelId: string;
  /** Price per 1M input tokens (dollars). Omitted for subscription offers. */
  costInput?: number;
  /** Price per 1M output tokens (dollars). Omitted for subscription offers. */
  costOutput?: number;
  /** Context window (tokens) this provider serves for the model. */
  context?: number;
  /** True when access comes with a subscription (no per-token price shown). */
  subscription: boolean;
}

/** A unique model, merged across every provider that offers it. */
export interface CatalogModel {
  /** Cross-provider normalized identity key (baked into the snapshot). */
  key: string;
  name: string;
  lab: LabId;
  description?: string;
  reasoning: boolean;
  /**
   * The model advertises native tool/function calling. OR-merged across the
   * providers that offer it (the snapshot's `toolCall` flag), mirroring
   * `reasoning`: any offering variant flagged tool-capable makes the model
   * tool-capable.
   */
  toolCall: boolean;
  /**
   * The model generates images (output modality). Only the LIVE OpenRouter
   * source carries this signal, so it is `false` for every snapshot-only model
   * and OR-merged (mirroring `reasoning`/`toolCall`) across offering variants.
   */
  imageGen: boolean;
  inputModalities: string[];
  knowledge?: string;
  releaseDate?: string;
  context?: number;
  output?: number;
  offers: CatalogOffer[];
}

/** The built catalog for a given set of visible providers. */
export interface HubCatalog {
  models: CatalogModel[];
  byKey: Map<string, CatalogModel>;
  byProvider: Map<string, CatalogModel[]>;
  modelCount: number;
  offerCount: number;
}
