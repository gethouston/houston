import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useAgentGrants,
  useIntegrationConnections,
  useIntegrationStatus,
  useIntegrationToolkits,
} from "../../hooks/queries";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useSession } from "../../hooks/use-session";
import { signInWithGoogle } from "../../lib/auth";
import { queryKeys } from "../../lib/query-keys";
import { isAuthConfigured } from "../../lib/supabase";
import { tauriIntegrations } from "../../lib/tauri";
import type { TabProps } from "../../lib/types";
import { BrowseAppsSection } from "./browse-apps-section";
import { ConnectedAppsSection } from "./connected-apps-section";
import { GrantedAppsSection } from "./granted-apps-section";
import {
  LoadingState,
  SigninState,
  UnavailableState,
} from "./integrations-states";
import { INTEGRATION_PROVIDER } from "./integrations-tab-model";
import { useIntegrationConnect } from "./use-integration-connect";

/**
 * The Integrations page (the legacy design on the platform API): connected
 * apps + the full browsable catalog. Connecting opens the APP's own OAuth (or
 * key prompt) on Composio's hosted page — the user never creates or sees a
 * Composio account — then we poll the connection until it turns active.
 */
export default function IntegrationsTab({ agent }: TabProps) {
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

  // Grants are a multiplayer-only concept (C4): per-(user, agent) toolkit
  // permission. In single-player they don't exist and the tab renders exactly
  // as before. We gate every grant surface on the `multiplayer` capability.
  const { capabilities } = useCapabilities();
  const multiplayer = capabilities?.multiplayer === true;
  const grantsQuery = useAgentGrants(agent.id, ready && multiplayer);
  const grantSet = useMemo(
    () => new Set(grantsQuery.data ?? []),
    [grantsQuery.data],
  );

  const { connectingToolkit, connect } = useIntegrationConnect({
    agentId: agent.id,
    multiplayer,
    grantSet,
  });
  const [signingIn, setSigningIn] = useState(false);

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
            {multiplayer ? (
              <GrantedAppsSection
                agentId={agent.id}
                connections={connections.data ?? []}
                catalog={catalog.data ?? []}
                grants={grantSet}
                onReconnect={(toolkit) => void connect(toolkit)}
              />
            ) : (
              <ConnectedAppsSection
                connections={connections.data ?? []}
                catalog={catalog.data ?? []}
                onReconnect={(toolkit) => void connect(toolkit)}
              />
            )}
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
