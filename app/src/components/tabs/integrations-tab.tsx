import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useIntegrationConnections,
  useIntegrationStatus,
  useIntegrationToolkits,
} from "../../hooks/queries";
import { useSession } from "../../hooks/use-session";
import { signInWithGoogle } from "../../lib/auth";
import { showErrorToast } from "../../lib/error-toast";
import { queryKeys } from "../../lib/query-keys";
import { isAuthConfigured } from "../../lib/supabase";
import { tauriIntegrations, tauriSystem } from "../../lib/tauri";
import type { TabProps } from "../../lib/types";
import { BrowseAppsSection } from "./browse-apps-section";
import { ConnectedAppsSection } from "./connected-apps-section";
import {
  LoadingState,
  SigninState,
  UnavailableState,
} from "./integrations-states";
import {
  INTEGRATION_PROVIDER,
  POLL_INTERVAL_MS,
  pollConnectionUntilActive,
} from "./integrations-tab-model";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * The Integrations page (the legacy design on the platform API): connected
 * apps + the full browsable catalog. Connecting opens the APP's own OAuth (or
 * key prompt) on Composio's hosted page — the user never creates or sees a
 * Composio account — then we poll the connection until it turns active.
 */
export default function IntegrationsTab(_props: TabProps) {
  const { t } = useTranslation("integrations");
  const qc = useQueryClient();
  const status = useIntegrationStatus();
  const { data: session } = useSession();
  const composio = status.data?.find(
    (p) => p.provider === INTEGRATION_PROVIDER,
  );
  const ready = !!composio?.ready;
  const connections = useIntegrationConnections(INTEGRATION_PROVIDER, ready);
  const catalog = useIntegrationToolkits(INTEGRATION_PROVIDER, ready);

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

  // Production users are ALWAYS signed in (App.tsx gates the whole shell on
  // it), so "host says signin while the app holds a session" is only the boot
  // race: the session-token push is async. Re-push once and hold the loading
  // state instead of flashing a sign-in card the user can't make sense of.
  // Only after that settles without flipping ready is the card shown (a real,
  // rare desync — signing in again fixes it).
  const token = session?.access_token ?? null;
  const [resynced, setResynced] = useState(false);
  useEffect(() => {
    if (!token || ready || resynced || status.isLoading || !composio) return;
    let stale = false;
    tauriIntegrations
      .setSession(token)
      .then(() =>
        qc.invalidateQueries({ queryKey: queryKeys.integrationStatus() }),
      )
      .catch(() => {
        // Surfaced by call(); the sign-in card below stays actionable.
      })
      .finally(() => {
        if (!stale) setResynced(true);
      });
    return () => {
      stale = true;
    };
  }, [token, ready, resynced, status.isLoading, composio, qc]);
  const sessionSyncPending = !!token && !ready && !resynced;

  // Connect AND reconnect are the same hand-off: mint the hosted link, open
  // the browser, poll until active. Every engine call routes through `call()`
  // (toasts + reports failures); we surface the two outcomes it can't see:
  // the poll timing out (abandoned flow) and the OAuth failing provider-side.
  const connect = useCallback(
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
        // Whatever happened, show the real state — a failed OAuth surfaces as
        // an error row with a Reconnect action, not a silently missing app.
        await qc.invalidateQueries({
          queryKey: queryKeys.integrationConnections(INTEGRATION_PROVIDER),
        });
        if (outcome === "timeout") {
          showErrorToast(
            "integration_connect_timeout",
            t("connectResult.timeout"),
          );
        } else if (outcome === "error") {
          showErrorToast(
            "integration_connect_failed",
            t("connectResult.failed"),
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
    <div className="h-full overflow-auto">
      <div className="mx-auto w-full max-w-3xl px-6 py-6">
        <div className="mb-6 min-h-[36px]">
          <h1 className="text-[28px] font-normal text-foreground">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("description")}
          </p>
        </div>

        {status.isLoading || sessionSyncPending ? (
          <LoadingState />
        ) : !composio ? (
          <UnavailableState />
        ) : !composio.ready ? (
          isAuthConfigured() ? (
            <SigninState onSignIn={() => void signIn()} signingIn={signingIn} />
          ) : (
            // A build with no auth baked can never obtain the session the
            // gateway needs — "sign in" would be a dead button, so say the
            // honest thing instead.
            <UnavailableState />
          )
        ) : (
          <>
            {composio.reconnect && (
              <div className="flex items-start gap-2 rounded-xl bg-secondary p-4 text-sm text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <span>{t("reconnectNotice")}</span>
              </div>
            )}
            <ConnectedAppsSection
              connections={connections.data ?? []}
              catalog={catalog.data ?? []}
              onReconnect={(toolkit) => void connect(toolkit)}
            />
            <BrowseAppsSection
              catalog={catalog.data ?? []}
              connectedToolkits={
                new Set((connections.data ?? []).map((c) => c.toolkit))
              }
              connectingToolkit={connectingToolkit}
              onConnect={(toolkit) => void connect(toolkit)}
            />
          </>
        )}
      </div>
    </div>
  );
}
