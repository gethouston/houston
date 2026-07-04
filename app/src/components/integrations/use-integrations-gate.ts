import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useIntegrationStatus } from "../../hooks/queries";
import { useSession } from "../../hooks/use-session";
import { signInWithGoogle } from "../../lib/auth";
import { showErrorToast } from "../../lib/error-toast";
import { queryKeys } from "../../lib/query-keys";
import { isAuthConfigured } from "../../lib/supabase";
import { tauriIntegrations } from "../../lib/tauri";
import { INTEGRATION_PROVIDER } from "./model";

/** The boot/auth gate both integrations surfaces render behind. */
export type IntegrationsGate =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "signin"; signIn: () => void; signingIn: boolean }
  | {
      kind: "ready";
      reconnectNotice: boolean;
      dismissReconnect: () => Promise<void>;
    };

/**
 * The status / session-resync / sign-in / reconnect-notice boot logic, extracted
 * from the legacy tab with identical behavior:
 *
 *  - Production users are ALWAYS signed in, so "host says signin while the app
 *    holds a session" is only the boot race (the session-token push is async).
 *    Re-push the token once and HOLD `loading` meanwhile instead of flashing a
 *    sign-in card. Only a real desync surfaces the card afterwards.
 *  - A build with no auth baked can never obtain the gateway session, so
 *    `auth-not-configured` maps to `unavailable`, never a dead sign-in button.
 */
export function useIntegrationsGate(): IntegrationsGate {
  const { t } = useTranslation("integrations");
  const qc = useQueryClient();
  const status = useIntegrationStatus();
  const { data: session } = useSession();
  const composio = status.data?.find(
    (p) => p.provider === INTEGRATION_PROVIDER,
  );
  const ready = !!composio?.ready;

  const [signingIn, setSigningIn] = useState(false);
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
  const sessionSyncPending = !!token && !!composio && !ready && !resynced;

  const signIn = useCallback(async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      // The auth layer's onAuthError listener only lives in SignInScreen (not
      // mounted here), so surface the kickoff failure ourselves.
      setSigningIn(false);
      showErrorToast("integrations_sign_in", t("signin.failed"), err);
    }
  }, [t]);

  const dismissReconnect = useCallback(async () => {
    try {
      await tauriIntegrations.dismissReconnectNotice();
      await qc.invalidateQueries({ queryKey: queryKeys.integrationStatus() });
    } catch {
      // Surfaced by call(); the banner stays until the dismissal sticks.
    }
  }, [qc]);

  if (status.isLoading || sessionSyncPending) return { kind: "loading" };
  if (!composio) return { kind: "unavailable" };
  if (!composio.ready) {
    if (isAuthConfigured()) {
      return { kind: "signin", signIn: () => void signIn(), signingIn };
    }
    return { kind: "unavailable" };
  }
  return {
    kind: "ready",
    reconnectNotice: !!composio.reconnect,
    dismissReconnect,
  };
}
