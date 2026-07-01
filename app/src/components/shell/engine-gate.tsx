import { type ReactNode, useEffect, useState } from "react";
import { useSession } from "../../hooks/use-session";
import { installDeepLinkListener } from "../../lib/auth";
import {
  hostedOauthGateActive,
  isEngineReady,
  setHostedEngineSessionToken,
  whenEngineReady,
} from "../../lib/engine";
import { hostedGateState } from "../../lib/engine-mode";
import i18n from "../../lib/i18n";
import { isAuthConfigured } from "../../lib/supabase";
import { SignInScreen } from "../auth/sign-in-screen";

/**
 * Blocks app rendering until the selected engine transport is ready. The hosted
 * OAuth gate waits for a Supabase session token before any engine-backed hook
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
    if (!isAuthConfigured()) return;
    return installDeepLinkListener();
  }, []);

  useEffect(() => {
    const token = session?.access_token ?? null;
    setHostedEngineSessionToken(token);
    if (token) setReady(true);
  }, [session?.access_token]);

  const state = hostedGateState({
    authConfigured: isAuthConfigured(),
    sessionLoading,
    hasSession: Boolean(session),
    engineReady: ready,
  });

  switch (state) {
    case "misconfigured":
      // Hosted OAuth is on but the build baked no Supabase project, so a session
      // token can never be obtained — the gateway would 401 every request. Fail
      // loudly instead of spinning on the "starting" splash forever.
      return <HostedAuthMisconfigured />;
    case "sign-in":
      // Cloud/remote login: surface the paste-the-code fallback (HOU-621).
      return <SignInScreen allowManualCallback />;
    case "ready":
      return <>{children}</>;
    default:
      return <EngineStarting />;
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

  if (!ready) return <EngineStarting />;
  return <>{children}</>;
}

function EngineStarting() {
  return <GateMessage>{i18n.t("shell:engineGate.starting")}</GateMessage>;
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
