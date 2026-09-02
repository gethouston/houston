import type { IntegrationToolkit } from "@houston-ai/engine-client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { queryKeys } from "../../lib/query-keys";
import { useUIStore } from "../../stores/ui";
import { prettifyToolkit } from "./app-display";
import { INTEGRATION_PROVIDER, type PollOutcome } from "./model";

/**
 * The connect flow's voice: the app's real name for outcome copy, and the ONE
 * toast per settled outcome that every surface shares (`use-connect-flow.ts`
 * wires it in as the runner's `announce`).
 *
 * A landed connection is a success toast; an abandoned OAuth is a calm,
 * neutral toast pointing at the pending row's Finish action, never a red one
 * with a bug report — walking away is normal behavior, not a crash; a
 * provider-side failure is an error toast with no auto bug report either.
 * A cancel is silent by design and never reaches here.
 */
export function useConnectAnnounce(): {
  /** The app's real catalog name, never the machine slug. */
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
