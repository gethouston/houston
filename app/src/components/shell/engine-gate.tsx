import { type ReactNode, useEffect, useState } from "react";
import { useSession } from "../../hooks/use-session";
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
import { logger } from "../../lib/logger";
import { SignInScreen } from "../auth/sign-in-screen";
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
  const { data: session, isLoading: sessionLoading } = useSession();

  useEffect(() => {
    if (!isIdentityConfigured()) return;
    // The 401 → refresh → replay seam (HOU-687): when the gateway rejects a
    // bearer (token expired while the app idled, connections severed by a
    // gateway roll), the adapter force-mints a fresh ID token and retries
    // instead of toasting. `refreshNow` returns null on a terminal refresh
    // failure (revoked/expired refresh token) — a real sign-out surfaced by the
    // auth gate; a transient throw is logged and treated as null so the 401
    // surfaces rather than crashing the refresher (parity with the old path).
    return installHostedSessionRefresh(async () => {
      try {
        return await refreshNow();
      } catch (e) {
        logger.warn(`[auth] hosted session refresh failed: ${e}`);
        return null;
      }
    });
  }, []);

  useEffect(() => {
    const token = session?.idToken ?? null;
    setHostedEngineSessionToken(token);
    if (token) setReady(true);
  }, [session?.idToken]);

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
        color: "#888",
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}
