import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { analytics } from "../../lib/analytics";
import { tauriIntegrations } from "../../lib/tauri";
import {
  isToolkitNoAuthError,
  isToolkitOauthUnavailableError,
} from "../../lib/toolkit-connect-refusals";
import { useUIStore } from "../../stores/ui";
import { useConnectAnnounce } from "./connect-announce";
import { INTEGRATION_PROVIDER } from "./model";

/**
 * Mint the hosted OAuth link for a toolkit — the runner's `mintLink`.
 *
 * Agent context: `agentId` is passed so the gateway enforces the agent's
 * effective allowlist on connect (Teams v2). Undefined on the account-level
 * Integrations page.
 *
 * The host's typed connect refusals are expected states, not crashes, and the
 * engine call is silenced for them — so THIS is their one surface. An
 * OAuth-unavailable refusal (the toolkit only signs in via OAuth and Houston
 * has no app registered for it yet — HOU-1110, highlevel) gets friendly copy
 * plus an analytics event so demand for the missing app stays visible. A
 * no-auth refusal (the app never needed an account; an agent-authored card
 * offered it anyway — HOUSTON-APP-4Z1, "composio") tells the user they are
 * already set. Either way the error is re-thrown so the runner settles the
 * row as failed.
 */
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
        if (isToolkitNoAuthError(err)) {
          addToast({
            title: t("connectResult.noAuthTitle", { app: appName(slug) }),
            description: t("connectResult.noAuth"),
            variant: "info",
          });
        } else if (isToolkitOauthUnavailableError(err)) {
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
