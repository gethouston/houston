import { useEffect, useMemo, useState } from "react";
import { HoustonEngineClient, type AuthStatus } from "@houston/engine-client";
import { ConnectView } from "./connect";
import { ChatView } from "./chat";
import { ui } from "./styles";

/**
 * Standalone app for the new TS engine (packages/engine): OAuth subscription
 * login + streaming chat via @houston/engine-client. No Tauri / old-engine code.
 * Mounted by main.tsx when VITE_NEW_ENGINE_URL is set or `?engine=new`.
 */
export function NewEngineApp({ baseUrl, token }: { baseUrl: string; token?: string }) {
  const client = useMemo(
    () => new HoustonEngineClient({ baseUrl, token }),
    [baseUrl, token],
  );
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    client
      .authStatus()
      .then((s) => { setStatus(s); setError(null); })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));

  useEffect(() => { void refresh(); }, [client]);

  if (error && !status) {
    return (
      <div style={ui.page}>
        <div style={ui.muted}>
          Can't reach the engine at <code>{baseUrl}</code>.
          <br />
          Start it (`bun run dev` in packages/engine) and reload.
          <br />
          <span style={{ opacity: 0.6 }}>{error}</span>
        </div>
      </div>
    );
  }
  if (!status) {
    return <div style={ui.page}><div style={ui.muted}>Connecting to engine…</div></div>;
  }
  return status.activeProvider ? (
    <ChatView client={client} />
  ) : (
    <ConnectView client={client} onConnected={refresh} />
  );
}
