/**
 * The live model-catalog wire type (protocol v3). Response body of the host's
 * live OpenRouter catalog route: the host fetches OpenRouter's model list,
 * normalizes each entry, and returns a `LiveCatalog`. The client renders it in
 * the model picker alongside the baked snapshot catalog.
 *
 * Like every other wire type here (see `conversation.ts` `ProviderInfo`), this
 * is a plain interface: the protocol package has no runtime-schema dependency,
 * and the host constructs these values, so validation of the untrusted upstream
 * OpenRouter payload belongs at the host's fetch boundary, not on this shape.
 */

/** Per-1M-token price for a model, in US dollars. */
export interface LiveModelPricing {
  /** Price per 1M input (prompt) tokens. */
  inPerMtok: number;
  /** Price per 1M output (completion) tokens. */
  outPerMtok: number;
}

/** The capabilities a live-catalog model advertises. */
export interface LiveModelCapabilities {
  /** Accepts image input. */
  vision: boolean;
  /** Supports extended reasoning / thinking. */
  reasoning: boolean;
  /** Supports native tool / function calling. */
  tools: boolean;
  /** Generates images (output modality). */
  imageGen: boolean;
}

/** One normalized model from the live OpenRouter catalog. */
export interface LiveCatalogModel {
  /** Provider-native model id (the id used to select the model). */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Short description, when the upstream provides one. */
  description?: string;
  /** Context window in tokens, when known. */
  contextWindow?: number;
  pricing: LiveModelPricing;
  capabilities: LiveModelCapabilities;
  /** Recently added upstream. Absent when recency is unknown. */
  isNew?: boolean;
}

/** The live catalog route response: normalized models, newest-relevant first. */
export type LiveCatalog = LiveCatalogModel[];
