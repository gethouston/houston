import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useProviderStatuses } from "../../hooks/use-provider-statuses";
import { queryKeys } from "../../lib/query-keys";
import {
  ManagerStepBody,
  ManagerStepFrame,
} from "../assistant/onboarding/manager-step-frame";
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
import { useOptimisticConnections } from "./connect-ai/use-optimistic-connections";

export function ConnectAiCard() {
  const { t } = useTranslation("setup");
  const queryClient = useQueryClient();
  const { providers, connections: probed, catalog } = useProviderBrowserData();
  const scan = useProviderStatuses();
  const connections = useOptimisticConnections(
    probed,
    !scan.isLoading && !scan.isError,
  );
  const featured = useMemo(() => featuredProviders(providers), [providers]);
  const [requestedView, setRequestedView] = useState<ConnectAiView>("featured");
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

  useProviderAutoSelect(probed, providers, refreshStatuses, false);

  return (
    <>
      <ManagerStepFrame id={`connect-ai-${view}`}>
        <ManagerStepBody title={t("connectAi.title")}>
          <div data-testid="manager-connect-ai">
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
        </ManagerStepBody>
      </ManagerStepFrame>
      <ProviderConnectionDialogs
        {...probed.dialogProps}
        onLocalConnected={refreshStatuses}
      />
    </>
  );
}
