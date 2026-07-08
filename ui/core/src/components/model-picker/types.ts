import type * as React from "react";

/** Freshness of the model catalog the picker is showing. */
export type ModelPickerCatalogState = "ready" | "loading";

/** Whether the app is authenticated with a given provider. */
export type ModelPickerConnection = "connected" | "checking" | "disconnected";

/**
 * Generic view-model of one selectable model. The app maps its own provider/model
 * records into this shape; the picker never sees app types. Minimal by design —
 * the picker renders only the name, an optional one-line description, and a check
 * on the selected row.
 */
export interface ModelPickerModel {
  /** Opaque stable id passed back to `onSelect`. */
  id: string;
  name: string;
  /** Groups rows + resolves the brand icon via `renderProviderIcon`. */
  providerId: string;
  /** A subtle one-line description, shown under the name when present. */
  description?: string;
  /**
   * Consumer-curated (flagship) row. Search ranking uses it as a tiebreaker on
   * match quality: within the same match tier a curated model outranks an
   * uncurated one, so legacy catalog entries never bury the flagships. Level
   * ordering is the caller's: rows render in input order, so pass them
   * pre-ranked.
   */
  curated?: boolean;
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
  /** Footer affordance that opens the provider-connection surface. */
  connectMore: string;
  /** Back affordance out of a provider's model list. */
  back: string;
  /** Accessible name for the connected-provider list (level 1). */
  providersLabel: string;
  /** Accessible name for a provider's model list (level 2). */
  modelsLabel: string;
  /** Accessible name for the flat search-results list. */
  resultsLabel: string;
  /** Neutral loading state while provider statuses / catalog resolve. */
  loading: string;
  /** Empty state when a search matches nothing. */
  empty: string;
  emptyHint: string;
  /** Empty state when no provider is connected yet. */
  noProviders: string;
}

export const DEFAULT_MODEL_PICKER_LABELS: ModelPickerLabels = {
  searchPlaceholder: "Search models…",
  connectMore: "Connect more providers…",
  back: "Back",
  providersLabel: "Providers",
  modelsLabel: "Models",
  resultsLabel: "Results",
  loading: "Loading providers…",
  empty: "No models found.",
  emptyHint: "Try another search term.",
  noProviders: "No providers connected yet.",
};

export interface ModelPickerProps {
  models: ModelPickerModel[];
  providers: ModelPickerProvider[];
  /** The currently selected model's id, for the check marker. */
  selectedId?: string;
  /** Catalog freshness; default `"ready"`. Drives the neutral loading state. */
  catalogState?: ModelPickerCatalogState;
  onSelect: (id: string) => void;
  /** Opens the app's provider-connection surface (the footer affordance). */
  onConnectMore?: () => void;
  /** App-supplied branded logo for a provider (falls back to an initial). */
  renderProviderIcon?: (
    providerId: string,
    className?: string,
  ) => React.ReactNode;
  labels?: Partial<ModelPickerLabels>;
  className?: string;
}
