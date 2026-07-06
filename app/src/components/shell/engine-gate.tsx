import { type ReactNode, useEffect, useState } from "react";
import { useSession } from "../../hooks/use-session";
import { installDeepLinkListener } from "../../lib/auth";
import {
  hostedOauthGateActive,
  installHostedSessionRefresh,
  isEngineReady,
  setHostedEngineSessionToken,
  whenEngineReady,
} from "../../lib/engine";
import { hostedGateState } from "../../lib/engine-mode";
import i18n from "../../lib/i18n";
import { isAuthConfigured, supabase } from "../../lib/supabase";
import { SignInScreen } from "../auth/sign-in-screen";
import { WorkspaceLoading } from "./workspace-loading";

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
    if (!isAuthConfigured()) return;
    // The 401 → refresh → replay seam (HOU-687): when the gateway rejects a
    // bearer (token expired while the app idled, connections severed by a
    // gateway roll), the adapter force-mints a fresh access token and retries
    // instead of toasting. refreshSession failing (revoked/absent refresh
    // token) resolves null — a real sign-out, surfaced by the auth gate.
    return installHostedSessionRefresh(async () => {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) return null;
      return data.session?.access_token ?? null;
    });
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
      // Hosted-gateway login. The paste-the-code fallback is dev-only: a dev
      // build doesn't own the `houston://` scheme (the callback opens the
      // installed production app), but production owns it and completes the
      // deep link natively — never show users the dev paste form (HOU-642).
      return <SignInScreen allowManualCallback={import.meta.env.DEV} />;
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
