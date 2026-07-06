import type * as React from "react";

/** Capability flags a model may advertise. Order here is the render order. */
export type ModelCapabilityKey = "vision" | "reasoning" | "tools" | "imageGen";

/** Coarse price bucket used for the row glyph and the price filter chips. */
export type ModelPriceTier = "free" | "low" | "mid" | "high";

/** Freshness of the model catalog the picker is showing. */
export type ModelPickerCatalogState = "ready" | "loading" | "offline";

/** Whether the app is authenticated with a given provider. */
export type ModelPickerConnection = "connected" | "checking" | "disconnected";

/** How the flat (search/filter/provider) list is ordered. */
export type ModelPickerSort = "relevance" | "price" | "context" | "newest";

/**
 * Generic view-model of one selectable model. The app (Wave 3) maps its own
 * provider/model records into this shape; the picker never sees app types.
 */
export interface ModelPickerModel {
  /** Opaque stable id passed back to `onSelect`. */
  id: string;
  name: string;
  /** Groups rows + resolves the brand icon via `renderProviderIcon`. */
  providerId: string;
  description?: string;
  capabilities: Record<ModelCapabilityKey, boolean>;
  /** `undefined` = unknown / subscription (no glyph, excluded from price filter). */
  priceTier?: ModelPriceTier;
  priceInPerMtok?: number;
  priceOutPerMtok?: number;
  /** Context window in tokens. */
  contextWindow?: number;
  isNew?: boolean;
}

/** A provider that owns one or more models in the catalog. */
export interface ModelPickerProvider {
  id: string;
  name: string;
  connection: ModelPickerConnection;
}

/**
 * Every user-facing string, so the component stays i18n-agnostic. The consumer
 * passes translated values; each field falls back to the English default.
 */
export interface ModelPickerLabels {
  searchPlaceholder: string;
  recent: string;
  favorites: string;
  results: string;
  all: string;
  connected: string;
  notConnected: string;
  connect: string;
  sort: string;
  sortRelevance: string;
  sortPrice: string;
  sortContext: string;
  sortNewest: string;
  filters: string;
  capabilities: string;
  price: string;
  clearFilters: string;
  favoritesOnly: string;
  new: string;
  free: string;
  priceFree: string;
  priceLow: string;
  priceMid: string;
  priceHigh: string;
  empty: string;
  emptyHint: string;
  loading: string;
  offline: string;
  capVision: string;
  capReasoning: string;
  capTools: string;
  capImageGen: string;
  detailContext: string;
  detailInput: string;
  detailOutput: string;
  detailCapabilities: string;
  detailModelId: string;
  /** e.g. singular/plural noun for the result count. */
  model: string;
  models: string;
  selected: string;
  keyboardHint: string;
}

export const DEFAULT_MODEL_PICKER_LABELS: ModelPickerLabels = {
  searchPlaceholder: "Search models, providers, capabilities…",
  recent: "Recent",
  favorites: "Favorites",
  results: "Results",
  all: "All models",
  connected: "Connected",
  notConnected: "Not connected",
  connect: "Connect",
  sort: "Sort",
  sortRelevance: "Relevance",
  sortPrice: "Price · low → high",
  sortContext: "Context · high → low",
  sortNewest: "Newest first",
  filters: "Filters",
  capabilities: "Capabilities",
  price: "Price",
  clearFilters: "Clear filters",
  favoritesOnly: "Favorites only",
  new: "New",
  free: "Free",
  priceFree: "Free",
  priceLow: "$ Cheap",
  priceMid: "$$ Mid",
  priceHigh: "$$$ Premium",
  empty: "No models match.",
  emptyHint: "Clear a filter or try another term.",
  loading: "Fetching latest catalog…",
  offline: "Showing cached catalog. Prices and new models may be stale.",
  capVision: "Vision",
  capReasoning: "Reasoning",
  capTools: "Tools",
  capImageGen: "Image gen",
  detailContext: "Context",
  detailInput: "Input",
  detailOutput: "Output",
  detailCapabilities: "Capabilities",
  detailModelId: "Model id",
  model: "model",
  models: "models",
  selected: "Selected",
  keyboardHint: "↑↓ navigate · ↵ select · esc close",
};

export interface ModelPickerProps {
  models: ModelPickerModel[];
  providers: ModelPickerProvider[];
  /** Favorite model ids. */
  favorites: string[];
  /** Recently used model ids, most-recent first. */
  recents: string[];
  selectedId?: string;
  /** Catalog freshness; default `"ready"`. */
  catalogState?: ModelPickerCatalogState;
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  /** Called when a disconnected provider's Connect affordance is used. */
  onConnect?: (providerId: string) => void;
  /** App-supplied branded logo for a provider (falls back to an initial). */
  renderProviderIcon?: (
    providerId: string,
    className?: string,
  ) => React.ReactNode;
  labels?: Partial<ModelPickerLabels>;
  className?: string;
}
