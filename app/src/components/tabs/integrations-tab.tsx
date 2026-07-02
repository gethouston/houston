import { useQueryClient } from "@tanstack/react-query";
import { Plug, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useIntegrationStatus } from "../../hooks/queries";
import { signInWithGoogle } from "../../lib/auth";
import { showErrorToast } from "../../lib/error-toast";
import { queryKeys } from "../../lib/query-keys";
import { tauriIntegrations, tauriSystem } from "../../lib/tauri";
import type { TabProps } from "../../lib/types";
import { IntegrationsConnections } from "./integrations-connections";
import {
  INTEGRATION_PROVIDER,
  POLL_INTERVAL_MS,
  pollConnectionUntilActive,
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

  const [connectingToolkit, setConnectingToolkit] = useState<string | null>(
    null,
  );
  const [signingIn, setSigningIn] = useState(false);
  // Stop the connect poll loop if the user leaves the tab mid-flow.
  const cancelled = useRef(false);
  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  // Platform mode: connecting an app opens ITS OWN OAuth consent (Gmail,
  // Slack…) — no Composio account, no provider sign-in. We then poll the
  // connection until the user finishes in the browser. Every engine call
  // routes through `call()` (toasts + reports failures); we surface the two
  // outcomes `call()` can't see: the poll timing out (abandoned flow) and the
  // OAuth failing on the provider's side.
  const addApp = useCallback(
    async (toolkit: string) => {
      setConnectingToolkit(toolkit);
      try {
        const { redirectUrl, connectionId } = await tauriIntegrations.connect(
          INTEGRATION_PROVIDER,
          toolkit,
        );
        await tauriSystem.openUrl(redirectUrl);
        const outcome = await pollConnectionUntilActive({
          poll: () =>
            tauriIntegrations.connection(INTEGRATION_PROVIDER, connectionId),
          sleep,
          isCancelled: () => cancelled.current,
          intervalMs: POLL_INTERVAL_MS,
        });
        if (outcome === "active") {
          await qc.invalidateQueries({
            queryKey: queryKeys.integrationConnections(INTEGRATION_PROVIDER),
          });
        } else if (outcome === "timeout") {
          showErrorToast(
            "integration_connect_timeout",
            t("integrations.connectTimeout"),
          );
        } else if (outcome === "error") {
          showErrorToast(
            "integration_connect_failed",
            t("integrations.connectFailed"),
          );
        }
      } catch {
        // The failing engine call (connect / open-url / poll) already surfaced
        // via `call()`. Swallow the re-throw so the click handler never leaks
        // an unhandled rejection.
      } finally {
        if (!cancelled.current) setConnectingToolkit(null);
      }
    },
    [qc, t],
  );

  // Desktop, signed out of Houston: the gateway has no session to forward.
  // Signing in is the ONLY step — the session sync pushes the token and the
  // status query flips to ready on its own.
  const signIn = useCallback(async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch {
      // Surfaced by the auth layer's own error listener; reset the spinner.
      setSigningIn(false);
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
        ) : !composio ? (
          <p className="text-sm text-muted-foreground">
            {t("integrations.unavailable")}
          </p>
        ) : !composio.ready ? (
          // Signed out of Houston (desktop) → one sign-in, nothing else.
          <div className="flex flex-col items-start gap-3 rounded-2xl border border-black/10 bg-card p-6">
            <div className="flex items-center gap-2">
              <Plug className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">
                {t("integrations.signinTitle")}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("integrations.signinBlurb")}
            </p>
            <button
              type="button"
              className={btn}
              onClick={() => {
                void signIn();
              }}
              disabled={signingIn}
            >
              {signingIn && <RefreshCw className="h-4 w-4 animate-spin" />}
              {t("integrations.signinButton")}
            </button>
          </div>
        ) : (
          <>
            {composio.reconnect && (
              <div className="flex items-start gap-2 rounded-2xl border border-black/10 bg-card p-4 text-sm text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                <span>{t("integrations.reconnectNotice")}</span>
              </div>
            )}
            <IntegrationsConnections
              onAddApp={(toolkit) => {
                void addApp(toolkit);
              }}
              connectingToolkit={connectingToolkit}
            />
          </>
        )}
      </div>
    </div>
  );
}
