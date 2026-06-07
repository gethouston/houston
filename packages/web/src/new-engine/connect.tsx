import { useEffect, useState } from "react";
import type { HoustonEngineClient, ProviderInfo } from "@houston/engine-client";
import { ui } from "./styles";

/**
 * Connect screen for the new engine: lists subscription providers and starts the
 * OAuth flow. Claude returns a URL to open; Codex returns a device code. Polls
 * until the provider is authenticated, then calls onConnected().
 */
export function ConnectView({
  client,
  onConnected,
}: {
  client: HoustonEngineClient;
  onConnected: () => void;
}) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    client.listProviders().then(setProviders).catch(() => setNote("Could not reach the engine."));
  }, [client]);

  const connect = async (p: ProviderInfo) => {
    setNote(`Starting ${p.name} login…`);
    try {
      const info = await client.startLogin(p.id);
      if (info.kind === "url") {
        window.open(info.url, "_blank", "noopener");
        setNote("Authorize in the new tab, then come back here.");
      } else {
        window.open(info.verificationUri, "_blank", "noopener");
        setNote(`Open ${info.verificationUri} and enter code: ${info.userCode}`);
      }
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
      return;
    }
    const poll = setInterval(async () => {
      try {
        const s = await client.authStatus();
        const pr = s.providers.find((x) => x.provider === p.id);
        if (pr?.configured) {
          clearInterval(poll);
          onConnected();
        } else if (pr?.login?.status === "error") {
          clearInterval(poll);
          setNote("Login failed: " + pr.login.error);
        }
      } catch {
        /* transient; keep polling */
      }
    }, 1500);
  };

  return (
    <div style={ui.page}>
      <div style={ui.card}>
        <div style={ui.brand}>🚀 Houston</div>
        <p style={ui.subtitle}>Connect your subscription to start chatting</p>
        {providers.map((p) => (
          <button
            key={p.id}
            style={{ ...ui.button, ...(p.configured ? { background: "#2a2a2a" } : {}) }}
            disabled={p.configured}
            onClick={() => connect(p)}
          >
            {p.configured ? `✓ ${p.name} connected` : `Connect ${p.name}`}
          </button>
        ))}
        {note ? <p style={ui.note}>{note}</p> : null}
      </div>
    </div>
  );
}
