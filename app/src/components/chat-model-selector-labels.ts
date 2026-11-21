import type { Capabilities, CredentialScope } from "@houston/engine-adapter";
import type { ModelPickerLabels } from "@houston-ai/core";
import type { useTranslation } from "react-i18next";
import { canSeeAiModelsPage } from "../lib/org-roles.ts";

export type PickerEmptyState = "personal" | "team";

export interface PickerEmptyStateDecision {
  variant: PickerEmptyState;
  canConnect: boolean;
}

export function pickerEmptyState(opts: {
  teamSpace: boolean;
  capabilities: Capabilities | null;
  capabilitiesLoaded: boolean;
}): PickerEmptyStateDecision {
  return {
    variant: opts.teamSpace ? "team" : "personal",
    canConnect:
      opts.capabilitiesLoaded && canSeeAiModelsPage(opts.capabilities),
  };
}

export function pickerAccountLabel(
  t: ReturnType<typeof useTranslation<"chat">>[0],
  scope: CredentialScope | null,
): string | undefined {
  if (scope === null) return undefined;
  return t(`modelSelector.picker.account.${scope}`);
}

export function buildLabels(
  t: ReturnType<typeof useTranslation<"chat">>[0],
  emptyState: PickerEmptyState,
): Partial<ModelPickerLabels> {
  const k = (key: string) => t(`modelSelector.picker.${key}`);
  return {
    searchPlaceholder: k("searchPlaceholder"),
    connectMore: k("connectMore"),
    back: k("back"),
    providersLabel: k("providersLabel"),
    modelsLabel: k("modelsLabel"),
    loading: k("loading"),
    empty: k("empty"),
    noProviders: k(`noProviders.${emptyState}.title`),
    noProvidersHint: k(`noProviders.${emptyState}.hint`),
    noProvidersAction: k("noProviders.action"),
  };
}
