import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useIntegrationStatus } from "../../hooks/queries";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useSession } from "../../hooks/use-session";
import { signInWithGoogle } from "../../lib/auth";
import { showErrorToast } from "../../lib/error-toast";
import { isIdentityConfigured } from "../../lib/identity";
import { queryKeys } from "../../lib/query-keys";
import { tauriIntegrations } from "../../lib/tauri";
import {
  readyTokens,
  resyncedTokens,
  resyncingTokens,
} from "./integrations-gate-state";
import { INTEGRATION_PROVIDER } from "./model";

export type IntegrationsGate =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | {
      kind: "signin";
      signIn: () => void;
      signingIn: boolean;
    }
  | {
      kind: "ready";
      reconnectNotice: boolean;
      dismissReconnect: () => Promise<void>;
    };

export function useIntegrationsGate(): IntegrationsGate {
  const { t } = useTranslation("integrations");
  const qc = useQueryClient();
  const { isLoading: capabilitiesLoading } = useCapabilities();
  const status = useIntegrationStatus();
  const { data: session } = useSession();
  const composio = status.data?.find(
    (p) => p.provider === INTEGRATION_PROVIDER,
  );
  const ready = !!composio?.ready;

  const [signingIn, setSigningIn] = useState(false);
  const token = session?.idToken ?? null;
  const [, setResyncVersion] = useState(0);
  const resynced =
    !!token && resyncedTokens.has(token) && !readyTokens.has(token);

  useEffect(() => {
    for (const tokens of [resyncedTokens, readyTokens, resyncingTokens]) {
      for (const value of tokens) if (value !== token) tokens.delete(value);
    }
    if (!token) return;
    if (ready) readyTokens.add(token);
    if (!ready && readyTokens.delete(token)) resyncedTokens.delete(token);
  }, [token, ready]);

  useEffect(() => {
    if (
      !token ||
      ready ||
      resynced ||
      status.isLoading ||
      !composio ||
      resyncingTokens.has(token)
    )
      return;
    let stale = false;
    resyncingTokens.add(token);
    tauriIntegrations
      .setSession(token)
      .then(() =>
        qc.invalidateQueries({ queryKey: queryKeys.integrationStatus() }),
      )
      .then(() => {
        resyncedTokens.add(token);
      })
      .catch(() => {})
      .finally(() => {
        resyncingTokens.delete(token);
        if (!stale) setResyncVersion((version) => version + 1);
      });
    return () => {
      stale = true;
    };
  }, [token, ready, resynced, status.isLoading, composio, qc]);
  const sessionSyncPending = !!token && !!composio && !ready && !resynced;

  const signIn = useCallback(async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setSigningIn(false);
      showErrorToast(
        "integrations_sign_in",
        err instanceof Error ? err.message : String(err),
        err,
        { userMessage: t("signin.failed") },
      );
    }
  }, [t]);

  const dismissReconnect = useCallback(async () => {
    try {
      await tauriIntegrations.dismissReconnectNotice();
      await qc.invalidateQueries({ queryKey: queryKeys.integrationStatus() });
    } catch {}
  }, [qc]);

  if (status.isLoading || capabilitiesLoading || sessionSyncPending)
    return { kind: "loading" };
  if (!composio) return { kind: "unavailable" };
  if (!composio.ready) {
    if (isIdentityConfigured()) {
      return {
        kind: "signin",
        signIn: () => void signIn(),
        signingIn,
      };
    }
    return { kind: "unavailable" };
  }
  return {
    kind: "ready",
    reconnectNotice: !!composio.reconnect,
    dismissReconnect,
  };
}
