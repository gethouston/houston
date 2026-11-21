import type { Capabilities } from "@houston/engine-adapter";
import { firstDayRefusal } from "@houston/sdk/agents/first-day-refusal";
import { pickerEmptyState } from "../components/chat-model-selector-labels";
import { useUIStore } from "../stores/ui";
import { analytics } from "./analytics";
import i18n from "./i18n";
import { providerName } from "./providers";
import { queryClient } from "./query-client";
import { queryKeys } from "./query-keys";
import { AI_HUB_VIEW_ID } from "./top-level-views";

export function showFirstDayNoProviderToast(error: unknown): void {
  const provider = firstDayRefusal(error)?.provider;
  analytics.track("agent_first_day_needs_ai", {
    surface: "refused",
    ...(provider ? { provider } : {}),
  });
  const name = provider ? providerName(provider) : null;
  const ui = useUIStore.getState();
  ui.addToast({
    title: name
      ? i18n.t("board:firstDay.reconnect.title", { provider: name })
      : i18n.t("board:firstDay.noProvider.title"),
    description: name
      ? i18n.t("board:firstDay.reconnect.body", { provider: name })
      : i18n.t("board:firstDay.noProvider.body"),
    variant: "info",
    ...(canReachAiHub()
      ? {
          action: {
            label: name
              ? i18n.t("board:firstDay.reconnect.action")
              : i18n.t("board:firstDay.noProvider.action"),
            onClick: () => useUIStore.getState().setViewMode(AI_HUB_VIEW_ID),
          },
        }
      : {}),
  });
}

function canReachAiHub(): boolean {
  const key = queryKeys.capabilities();
  const status = queryClient.getQueryState(key)?.status;
  return pickerEmptyState({
    teamSpace: false,
    capabilities: queryClient.getQueryData<Capabilities>(key) ?? null,
    capabilitiesLoaded: status === "success" || status === "error",
  }).canConnect;
}
