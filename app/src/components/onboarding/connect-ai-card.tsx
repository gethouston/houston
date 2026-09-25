import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { queryKeys } from "../../lib/query-keys";
import { ProviderConnectionDialogs } from "../provider-browser/provider-connection-dialogs";
import { useProviderAutoSelect } from "../provider-browser/use-provider-auto-select";
import { useProviderBrowserData } from "../provider-browser/use-provider-browser-data";
import { AllProvidersView } from "./connect-ai/all-providers-view";
import {
  type ConnectAiView,
  featuredProviders,
  resolveConnectAiView,
} from "./connect-ai/featured-subscriptions";
import { FeaturedView } from "./connect-ai/featured-view";
import { FirstRunScreen } from "./first-run-screen";
import { SetupCard } from "./setup-card";

/**
 * First-run onboarding's "Connect your AI" card: two cards for the plans most
 * people already pay for (Claude, ChatGPT), and "View more" that swaps them
 * for the full provider browser. The cards and the browser rows share one
 * `useProviderConnections` instance (its `connect` / `cancel`), and the card
 * mounts that instance's dialog stack once, so both start and finish a
 * sign-in identically. `FirstRunOnboarding` mounts
 * `ProviderLoginFallback` + `ClaudeBrowserLogin` beside it so every sign-in
 * can open.
 *
 * The card never advances itself: the first-run route reads the shared
 * provider statuses and moves on to the team card the moment one provider is
 * confirmed connected. The connect signal only refreshes those statuses so the
 * move happens without waiting for the next poll.
 */
export function ConnectAiCard() {
  const { t } = useTranslation("setup");
  const queryClient = useQueryClient();
  const { providers, connections, catalog } = useProviderBrowserData();
  const featured = useMemo(() => featuredProviders(providers), [providers]);
  const [requestedView, setRequestedView] = useState<ConnectAiView>("featured");
  // The first render focuses nothing; after a swap, the new view focuses the
  // control that swaps back.
  const [swapped, setSwapped] = useState(false);
  const view = resolveConnectAiView(requestedView, featured.length);
  const showView = (next: ConnectAiView) => {
    setSwapped(true);
    setRequestedView(next);
  };

  const refreshStatuses = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.providerStatuses(),
    });
  }, [queryClient]);

  useProviderAutoSelect(connections, providers, refreshStatuses, false);

  return (
    <FirstRunScreen>
      <SetupCard
        title={t("connectAi.title")}
        subtitle={t("connectAi.subtitle")}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          {view === "featured" ? (
            <FeaturedView
              featured={featured}
              connections={connections}
              onViewMore={() => showView("all")}
              focusToggle={swapped}
            />
          ) : (
            <AllProvidersView
              providers={providers}
              connections={connections}
              catalog={catalog}
              onShowFewer={
                featured.length > 0 ? () => showView("featured") : undefined
              }
              focusToggle={swapped}
            />
          )}
        </div>
        <ProviderConnectionDialogs
          {...connections.dialogProps}
          // The local provider's model is typed in its dialog and never reaches
          // the status snapshot, so its connect refreshes the statuses here.
          onLocalConnected={refreshStatuses}
        />
      </SetupCard>
    </FirstRunScreen>
  );
}
