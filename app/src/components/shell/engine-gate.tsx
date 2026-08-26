import { type ReactNode, useEffect, useState } from "react";
import { SessionUnavailableError, useSession } from "../../hooks/use-session";
import {
  hostedOauthGateActive,
  installHostedSessionRefresh,
  isEngineReady,
  setHostedEngineSessionToken,
  whenEngineReady,
} from "../../lib/engine";
import { hostedGateState } from "../../lib/engine-mode";
import i18n from "../../lib/i18n";
import { isIdentityConfigured, refreshNow } from "../../lib/identity";
import { SignInScreen } from "../auth/sign-in-screen";
import { StorageUnavailableScreen } from "../auth/storage-unavailable-screen";
import { WorkspaceLoading } from "./workspace-loading";

/**
 * Blocks app rendering until the selected engine transport is ready. The hosted
 * OAuth gate waits for a Firebase session token before any engine-backed hook
 * mounts; every other mode (co-located sidecar, static-token host, static-token
 * hosted gateway) waits only for the engine handshake.
 */
export function EngineGate({ children }: { children: ReactNode }) {
  if (hostedOauthGateActive()) {
    return <HostedEngineGate>{children}</HostedEngineGate>;
  }
  return <SidecarEngineGate>{children}</SidecarEngineGate>;
}

function HostedEngineGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(isEngineReady());
  const {
    data: session,
    isLoading: sessionLoading,
    error: sessionError,
    refetch: refetchSession,
  } = useSession();

  useEffect(() => {
    if (!isIdentityConfigured()) return;
    // The 401 → refresh → replay seam (HOU-687): when the gateway rejects a
    // bearer (token expired while the app idled, connections severed by a
    // gateway roll), the adapter force-mints a fresh ID token and retries
    // instead of toasting. `refreshNow`'s answer is three-valued and must pass
    // through INTACT (HOU-1106): a token means refreshed; null means the
    // session is terminally gone (a real sign-out — this gate surfaces the
    // sign-in screen); and a transient `IdentityError("network")` (the
    // identity service unreachable while a sleep-wake reconnect settles)
    // THROWS, so the adapter's classifier reads it as connectivity and the
    // read retries as the reconnect settles. Catching that throw and
    // answering null — as this seam once did — is indistinguishable from the
    // terminal sign-out: the stale-token 401 stood and every live query
    // reported a bogus "invalid or expired token" storm to Sentry
    // (PRODUCT-1531).
    return installHostedSessionRefresh(refreshNow);
  }, []);

  useEffect(() => {
    const token = session?.idToken ?? null;
    setHostedEngineSessionToken(token);
    if (token) setReady(true);
  }, [session?.idToken]);

  // Secure-storage read fault (retries exhausted): the store couldn't be read,
  // which is NOT a signed-out user. Show the retryable storage-error screen,
  // never SignInScreen (a spurious sign-in here reads as a logout).
  if (
    isIdentityConfigured() &&
    sessionError instanceof SessionUnavailableError
  ) {
    return <StorageUnavailableScreen onRetry={() => void refetchSession()} />;
  }

  const state = hostedGateState({
    authConfigured: isIdentityConfigured(),
    sessionLoading,
    hasSession: Boolean(session),
    engineReady: ready,
  });

  switch (state) {
    case "misconfigured":
      // Hosted OAuth is on but the build baked no Firebase project, so a session
      // token can never be obtained — the gateway would 401 every request. Fail
      // loudly instead of spinning on the "starting" splash forever.
      return <HostedAuthMisconfigured />;
    case "sign-in":
      // Hosted-gateway login. Dev builds sign in with the passwordless email
      // code (the `houston://` OAuth callback opens the installed prod app, so
      // Google sign-in is prod-only there — HOU-642).
      return <SignInScreen />;
    case "ready":
      return <>{children}</>;
    default:
      return <WorkspaceLoading />;
  }
}

function SidecarEngineGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(isEngineReady());
  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    whenEngineReady().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  if (!ready) return <WorkspaceLoading />;
  return <>{children}</>;
}

function HostedAuthMisconfigured() {
  return (
    <GateMessage>
      <span style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
        {i18n.t("shell:engineGate.authRequiredTitle")}
      </span>
      <span style={{ display: "block", maxWidth: 440 }}>
        {i18n.t("shell:engineGate.authRequiredBody")}
      </span>
    </GateMessage>
  );
}

function GateMessage({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        height: "100vh",
        padding: "0 24px",
        fontFamily: "system-ui, sans-serif",
        color: "var(--ht-ink-muted)",
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}
