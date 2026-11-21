import type { IntegrationToolkit } from "@houston/engine-adapter";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { queryKeys } from "../../lib/query-keys";
import { useUIStore } from "../../stores/ui";
import { prettifyToolkit } from "./app-display";
import { INTEGRATION_PROVIDER, type PollOutcome } from "./model";

export function useConnectAnnounce(): {
  appName: (toolkit: string) => string;
  announce: (toolkit: string, outcome: PollOutcome) => void;
} {
  const { t } = useTranslation("integrations");
  const qc = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);

  const appName = useCallback(
    (toolkit: string) => {
      const catalog = qc.getQueryData<IntegrationToolkit[]>(
        queryKeys.integrationToolkits(INTEGRATION_PROVIDER),
      );
      return (
        catalog?.find((tk) => tk.slug === toolkit)?.name ??
        prettifyToolkit(toolkit)
      );
    },
    [qc],
  );

  const announce = useCallback(
    (toolkit: string, outcome: PollOutcome) => {
      const app = appName(toolkit);
      if (outcome === "active") {
        addToast({
          title: t("connectResult.connected", { app }),
          variant: "success",
        });
      } else if (outcome === "timeout") {
        addToast({
          title: t("connectResult.timeoutTitle", { app }),
          description: t("connectResult.timeout", { app }),
          variant: "info",
        });
      } else if (outcome === "error") {
        addToast({
          title: t("connectResult.failedTitle", { app }),
          description: t("connectResult.failed"),
          variant: "error",
        });
      }
    },
    [addToast, appName, t],
  );

  return { appName, announce };
}
