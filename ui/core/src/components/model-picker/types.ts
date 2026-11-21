import type * as React from "react";

export type ModelPickerCatalogState = "ready" | "loading";

export type ModelPickerConnection = "connected" | "checking" | "disconnected";

export interface ModelPickerModel {
  id: string;
  name: string;
  providerId: string;
  description?: string;
}

export interface ModelPickerProvider {
  id: string;
  name: string;
  connection: ModelPickerConnection;
}

export interface ModelPickerLabels {
  searchPlaceholder: string;
  connectMore: string;
  back: string;
  providersLabel: string;
  modelsLabel: string;
  loading: string;
  empty: string;
  noProviders: string;
  noProvidersHint: string;
  noProvidersAction: string;
}

export const DEFAULT_MODEL_PICKER_LABELS: ModelPickerLabels = {
  searchPlaceholder: "Search models…",
  connectMore: "Connect another AI…",
  back: "Back",
  providersLabel: "Providers",
  modelsLabel: "Models",
  loading: "Loading AIs…",
  empty: "No models found.",
  noProviders: "Connect an AI to start chatting",
  noProvidersHint:
    "Answers come from an AI like Claude or ChatGPT. Connect one to get started.",
  noProvidersAction: "Connect AI",
};

export interface ModelPickerProps {
  models: ModelPickerModel[];
  providers: ModelPickerProvider[];
  selectedId?: string;
  catalogState?: ModelPickerCatalogState;
  onSelect: (id: string) => void;
  onConnectMore?: () => void;
  onEmptyStateAction?: (() => void) | null;
  renderProviderIcon?: (
    providerId: string,
    className?: string,
  ) => React.ReactNode;
  labels?: Partial<ModelPickerLabels>;
  footer?: React.ReactNode;
  className?: string;
}
