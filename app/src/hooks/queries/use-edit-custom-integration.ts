import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { customEditPatches } from "../../lib/integration-cache-patches";
import { optimisticWrite } from "../../lib/optimistic-write";
import { queryKeys } from "../../lib/query-keys";
import { tauriIntegrations } from "../../lib/tauri";
import { useCustomIntegrationScope } from "./use-custom-transport";

export function useEditCustomIntegration(agentId?: string) {
  const qc = useQueryClient();
  const { t } = useTranslation("integrations");
  const scope = useCustomIntegrationScope();
  return useCallback(
    (input: { slug: string; name: string; website: string }) =>
      void optimisticWrite({
        qc,
        command: "custom_integration_update_details",
        patches: customEditPatches(input.slug, input, { scope, agentId }),
        write: () =>
          tauriIntegrations.customUpdateDetails(
            input.slug,
            { name: input.name, website: input.website },
            agentId,
          ),
        failure: {
          title: t("writeFailed.editCustom.title"),
          description: t("writeFailed.editCustom.description"),
        },
        invalidate: [
          queryKeys.customIntegrations(),
          queryKeys.integrationConnections("custom"),
        ],
      }),
    [qc, agentId, scope, t],
  );
}
