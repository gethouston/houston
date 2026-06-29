import { type ReactNode, useEffect, useState } from "react";
import { useSession } from "../../hooks/use-session";
import { installDeepLinkListener } from "../../lib/auth";
import {
  hostedEngineActive,
  isEngineReady,
  setHostedEngineSessionToken,
  whenEngineReady,
} from "../../lib/engine";
import i18n from "../../lib/i18n";
import { isAuthConfigured } from "../../lib/supabase";
import { SignInScreen } from "../auth/sign-in-screen";

/**
 * Blocks app rendering until the selected engine transport is ready. Hosted
 * mode waits for a Supabase session token before any engine-backed hook mounts.
 */
export function EngineGate({ children }: { children: ReactNode }) {
  if (hostedEngineActive()) {
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

  if (isAuthConfigured() && sessionLoading) {
    return <EngineStarting />;
  }

  if (isAuthConfigured() && !session) {
    return <SignInScreen />;
  }

  if (!ready) return <EngineStarting />;
  return <>{children}</>;
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
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        fontFamily: "system-ui, sans-serif",
        color: "#888",
        fontSize: 14,
      }}
    >
      {i18n.t("shell:engineGate.starting")}
    </div>
  );
}
