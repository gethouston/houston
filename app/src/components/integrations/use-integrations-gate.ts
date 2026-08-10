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

/**
 * The boot/auth gate both integrations surfaces render behind. The non-ready
 * kinds describe the COMPOSIO catalog only — whether custom integrations are
 * served is the custom LIST's own truth (`useCustomIntegrationsSurface`:
 * resolved array = yes, `null` = unsupported host), which is what keeps the
 * page useful on an install with no Composio key or a signed-out desktop.
 */
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

// Both Integrations surfaces use this hook. A session push belongs to the
// session, not to either component mount, so revisiting either surface cannot
// manufacture a loading gate.
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
  // The status query is gated on the advertised `integrations` capability, so
  // until capabilities resolve it sits idle (`isLoading` false, no data) —
  // hold `loading`, not a premature `unavailable`.
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
  // A provider that was ready then falls back to `signin` needs a fresh push,
  // even before the bookkeeping effect removes its old success latch.
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
      .catch(() => {
        // Surfaced by call(); the sign-in card below stays actionable.
      })
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
      // The auth layer's onAuthError listener only lives in SignInScreen (not
      // mounted here), so surface the kickoff failure ourselves.
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
    } catch {
      // Surfaced by call(); the banner stays until the dismissal sticks.
    }
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
