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
    return installHostedSessionRefresh(refreshNow);
  }, []);

  useEffect(() => {
    const token = session?.idToken ?? null;
    setHostedEngineSessionToken(token);
    if (token) setReady(true);
  }, [session?.idToken]);

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
      return <HostedAuthMisconfigured />;
    case "sign-in":
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
        height: "100dvh",
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
