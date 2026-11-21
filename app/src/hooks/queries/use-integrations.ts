import type { IntegrationProviderId } from "@houston/protocol";
import type { IntegrationConnection } from "@houston/wire-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cancelFlowsForDisconnect } from "../../components/integrations/connect-flow-registry";
import { integrationsSupported } from "../../components/integrations/model";
import { analytics } from "../../lib/analytics";
import { connectionsWithout } from "../../lib/integration-cache-patches";
import { optimisticWrite } from "../../lib/optimistic-write";
import { queryKeys } from "../../lib/query-keys";
import { tauriIntegrations } from "../../lib/tauri";
import { connectFlowRegistry } from "../../stores/connect-flow";
import { useCapabilities } from "../use-capabilities";

export function useIntegrationStatus() {
  const { capabilities } = useCapabilities();
  return useQuery({
    queryKey: queryKeys.integrationStatus(),
    queryFn: () => tauriIntegrations.status(),
    staleTime: 30_000,
    enabled: integrationsSupported(capabilities),
  });
}

function useProviderRegistered(provider: IntegrationProviderId): boolean {
  const status = useIntegrationStatus();
  return !!status.data?.some((p) => p.provider === provider);
}

export function useIntegrationConnections(
  provider: IntegrationProviderId,
  enabled: boolean,
) {
  const registered = useProviderRegistered(provider);
  return useQuery({
    queryKey: queryKeys.integrationConnections(provider),
    queryFn: () => tauriIntegrations.connections(provider),
    enabled: enabled && registered,
    staleTime: 30_000,
  });
}

export function useIntegrationToolkits(
  provider: IntegrationProviderId,
  enabled: boolean,
) {
  const registered = useProviderRegistered(provider);
  return useQuery({
    queryKey: queryKeys.integrationToolkits(provider),
    queryFn: () => tauriIntegrations.toolkits(provider),
    enabled: enabled && registered,
    staleTime: 60 * 60 * 1000,
  });
}

export function useDisconnectIntegration(provider: IntegrationProviderId) {
  const qc = useQueryClient();
  const { t } = useTranslation("integrations");
  return useCallback(
    ({ toolkit, connectionId }: { toolkit: string; connectionId?: string }) => {
      cancelFlowsForDisconnect(connectFlowRegistry, toolkit, connectionId);
      void optimisticWrite({
        qc,
        command: "integration_disconnect",
        patches: [
          {
            queryKey: queryKeys.integrationConnections(provider),
            apply: (rows: IntegrationConnection[] | undefined) =>
              connectionsWithout(rows, toolkit, connectionId),
          },
        ],
        write: () =>
          tauriIntegrations.disconnect(provider, toolkit, connectionId),
        failure: {
          title: t("writeFailed.disconnect.title"),
          description: t("writeFailed.disconnect.description"),
        },
        onSuccess: () =>
          analytics.track("integration_disconnected", {
            integration_slug: toolkit,
          }),
      });
    },
    [qc, provider, t],
  );
}
