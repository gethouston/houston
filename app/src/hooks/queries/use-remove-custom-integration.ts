import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { customRemovalPatches } from "../../lib/integration-cache-patches";
import { optimisticWrite } from "../../lib/optimistic-write";
import { queryKeys } from "../../lib/query-keys";
import { tauriIntegrations } from "../../lib/tauri";
import { useCustomIntegrationScope } from "./use-custom-transport";

export function useRemoveCustomIntegration(agentId?: string) {
  const qc = useQueryClient();
  const { t } = useTranslation("integrations");
  const scope = useCustomIntegrationScope();
  return useCallback(
    (slug: string) =>
      void optimisticWrite({
        qc,
        command: "custom_integration_remove",
        patches: customRemovalPatches(slug, { scope, agentId }),
        write: () =>
          agentId
            ? tauriIntegrations.customRemoveForAgent(agentId, slug)
            : tauriIntegrations.customRemove(slug),
        failure: {
          title: t("writeFailed.removeCustom.title"),
          description: t("writeFailed.removeCustom.description"),
        },
        invalidate: [
          queryKeys.customIntegrations(),
          queryKeys.integrationConnections("custom"),
        ],
      }),
    [qc, agentId, scope, t],
  );
}
