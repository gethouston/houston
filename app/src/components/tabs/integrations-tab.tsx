import { useQueryClient } from "@tanstack/react-query";
import { Plug, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useIntegrationStatus } from "../../hooks/queries";
import { showErrorToast } from "../../lib/error-toast";
import { queryKeys } from "../../lib/query-keys";
import { tauriIntegrations, tauriSystem } from "../../lib/tauri";
import type { TabProps } from "../../lib/types";
import { IntegrationsConnections } from "./integrations-connections";
import {
  INTEGRATION_PROVIDER,
  POLL_INTERVAL_MS,
  pollLoginUntilLinked,
} from "./integrations-tab-model";

const btn =
  "inline-flex items-center gap-2 rounded-full border border-black/15 bg-background px-4 h-9 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export default function IntegrationsTab(_props: TabProps) {
  const { t } = useTranslation("agents");
  const qc = useQueryClient();
  const status = useIntegrationStatus();
  const composio = status.data?.find(
    (p) => p.provider === INTEGRATION_PROVIDER,
  );
  const connected = !!composio?.connected;

  const [connecting, setConnecting] = useState(false);
  // Stop the login poll loop if the user leaves the tab mid-flow.
  const cancelled = useRef(false);
  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  // The no-API-key sign-in: open the provider's login URL, then poll until the
  // user finishes there. The key is fetched + stored host-side — never here.
  // Every engine call routes through `call()`, which already toasts + reports
  // failures, so we only need to (a) absorb the re-thrown rejection so it never
  // becomes an unhandled promise rejection, and (b) surface the ONE failure
  // `call()` can't see: the poll timing out because the user abandoned the flow.
  const connectAccount = useCallback(async () => {
    setConnecting(true);
    try {
      const { loginUrl, pollKey } =
        await tauriIntegrations.startLogin(INTEGRATION_PROVIDER);
      await tauriSystem.openUrl(loginUrl);
      const outcome = await pollLoginUntilLinked({
        poll: () => tauriIntegrations.pollLogin(INTEGRATION_PROVIDER, pollKey),
        sleep,
        isCancelled: () => cancelled.current,
        intervalMs: POLL_INTERVAL_MS,
      });
      if (outcome === "linked") {
        await qc.invalidateQueries({
          queryKey: queryKeys.integrationStatus(),
        });
      } else if (outcome === "timeout") {
        showErrorToast(
          "integration_login_timeout",
          t("integrations.loginTimeout"),
        );
      }
    } catch {
      // The failing engine call (start / open-url / poll) already surfaced via
      // `call()`. Swallow the re-throw here so the click handler never leaks an
      // unhandled rejection.
    } finally {
      if (!cancelled.current) setConnecting(false);
    }
  }, [qc, t]);

  // Adding an app hands off to the provider's hosted connect (it owns the
  // OAuth). Both calls route through `call()`; catch the re-throw so the click
  // handler stays an awaited, surfaced boundary.
  const addApp = useCallback(async (toolkit: string) => {
    try {
      const { redirectUrl } = await tauriIntegrations.connect(
        INTEGRATION_PROVIDER,
        toolkit,
      );
      await tauriSystem.openUrl(redirectUrl);
    } catch {
      // Already surfaced by `call()`; swallow so onClick doesn't fire-and-forget.
    }
  }, []);

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header>
          <h2 className="text-lg font-semibold">{t("integrations.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("integrations.description")}
          </p>
        </header>

        {status.isLoading ? (
          <p className="text-sm text-muted-foreground">
            {t("integrations.loading")}
          </p>
        ) : !connected ? (
          // Not connected → sign in to the user's own Composio account.
          <div className="flex flex-col items-start gap-3 rounded-2xl border border-black/10 bg-card p-6">
            <div className="flex items-center gap-2">
              <Plug className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">{t("integrations.composio")}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("integrations.connectBlurb")}
            </p>
            <button
              type="button"
              className={btn}
              onClick={() => {
                void connectAccount();
              }}
              disabled={connecting}
            >
              {connecting && <RefreshCw className="h-4 w-4 animate-spin" />}
              {connecting
                ? t("integrations.connecting")
                : t("integrations.connect")}
            </button>
          </div>
        ) : (
          <IntegrationsConnections
            email={composio?.account?.email}
            onAddApp={(toolkit) => {
              void addApp(toolkit);
            }}
          />
        )}
      </div>
    </div>
  );
}
