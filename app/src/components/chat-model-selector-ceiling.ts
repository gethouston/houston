import type { ModelPickerLabels, ModelPickerProvider } from "@houston-ai/core";
import type { useTranslation } from "react-i18next";

export type CeilingEmptyState = "connect" | "choose" | "ask" | "unreachable";

type Connection = Pick<ModelPickerProvider, "connection">;

const connectedCount = (providers: readonly Connection[]) =>
  providers.filter((p) => p.connection === "connected").length;

export function ceilingEmptyState(opts: {
  catalogState: "loading" | "ready";
  unclamped: readonly Connection[];
  clamped: readonly Connection[];
  canManageAgent: boolean;
  modelsSectionReachable: boolean;
}): CeilingEmptyState | null {
  if (opts.catalogState !== "ready") return null;
  if (connectedCount(opts.unclamped) === 0) return null;
  if (connectedCount(opts.clamped) > 0) return null;
  if (opts.clamped.length > 0) return "connect";
  if (!opts.canManageAgent) return "ask";
  return opts.modelsSectionReachable ? "choose" : "unreachable";
}

export function ceilingEmptyAction(
  state: CeilingEmptyState | null,
  chooseModels: () => void,
): (() => void) | null | undefined {
  if (state === null || state === "connect") return undefined;
  return state === "choose" ? chooseModels : null;
}

export function ceilingEmptyLabels(
  t: ReturnType<typeof useTranslation<"chat">>[0],
  state: CeilingEmptyState,
): Pick<
  ModelPickerLabels,
  "noProviders" | "noProvidersHint" | "noProvidersAction"
> {
  return {
    noProviders: t("modelSelector.picker.ceilingEmpty.title"),
    noProvidersHint: t(`modelSelector.picker.ceilingEmpty.hint.${state}`),
    noProvidersAction: t(
      state === "connect"
        ? "modelSelector.picker.noProviders.action"
        : "modelSelector.picker.ceilingEmpty.action",
    ),
  };
}
