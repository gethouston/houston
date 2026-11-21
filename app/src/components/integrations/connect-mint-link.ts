import { integrationConnectRefusal } from "@houston/sdk/integrations/connect-refusal";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { analytics } from "../../lib/analytics";
import { tauriIntegrations } from "../../lib/tauri";
import { useUIStore } from "../../stores/ui";
import { useConnectAnnounce } from "./connect-announce";
import { INTEGRATION_PROVIDER } from "./model";

export function useMintConnectLink(
  agentId: string | undefined,
): (slug: string) => Promise<{ redirectUrl: string; connectionId: string }> {
  const { t } = useTranslation("integrations");
  const addToast = useUIStore((s) => s.addToast);
  const { appName } = useConnectAnnounce();
  return useCallback(
    async (slug: string) => {
      try {
        return await tauriIntegrations.connect(
          INTEGRATION_PROVIDER,
          slug,
          agentId,
        );
      } catch (err) {
        const refusal = integrationConnectRefusal(err);
        if (refusal === "toolkit_no_auth") {
          addToast({
            title: t("connectResult.noAuthTitle", { app: appName(slug) }),
            description: t("connectResult.noAuth"),
            variant: "info",
          });
        } else if (refusal === "toolkit_not_found") {
          addToast({
            title: t("connectResult.notFoundTitle", { app: appName(slug) }),
            description: t("connectResult.notFound"),
            variant: "info",
          });
        } else if (refusal === "toolkit_oauth_unavailable") {
          analytics.track("integration_connect_unavailable", {
            integration_slug: slug,
          });
          addToast({
            title: t("connectResult.unavailableTitle", {
              app: appName(slug),
            }),
            description: t("connectResult.unavailable"),
            variant: "error",
          });
        }
        throw err;
      }
    },
    [addToast, agentId, appName, t],
  );
}
