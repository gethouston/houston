import { useEffect, useState } from "react";
import type { HoustonEngineClient, ProviderId, ProviderInfo } from "@houston/runtime-client";
import { ui } from "./styles";

/**
 * Connect screen for the new engine: lists subscription providers and starts the
 * OAuth flow. Claude returns a URL to open — locally the engine catches the
 * loopback redirect (`url`); headless, the user pastes the code Claude shows
 * (`auth_code`). Codex returns a device code. Polls until the provider is
 * authenticated, then calls onConnected().
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
  // Set when a headless Claude login is waiting for the user to paste a code.
  const [pendingCode, setPendingCode] = useState<{ id: ProviderId; hint?: string } | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    client.listProviders().then(setProviders).catch(() => setNote("Could not reach the engine."));
  }, [client]);

  const pollUntilConnected = (id: ProviderId) => {
    const poll = setInterval(async () => {
      try {
        const s = await client.authStatus();
        const pr = s.providers.find((x) => x.provider === id);
        if (pr?.configured) {
          clearInterval(poll);
          onConnected();
        } else if (pr?.login?.status === "error") {
          clearInterval(poll);
          setPendingCode(null);
          setNote("Login failed: " + pr.login.error);
        }
      } catch {
        /* transient; keep polling */
      }
    }, 1500);
  };

  const connect = async (p: ProviderInfo) => {
    setNote(`Starting ${p.name} login…`);
    setPendingCode(null);
    setCode("");
    try {
      const info = await client.startLogin(p.id);
      if (info.kind === "url") {
        window.open(info.url, "_blank", "noopener");
        setNote("Authorize in the new tab, then come back here.");
      } else if (info.kind === "auth_code") {
        window.open(info.url, "_blank", "noopener");
        setNote(info.instructions ?? "Approve in the new tab, then paste the code Claude shows.");
        setPendingCode({ id: p.id, hint: info.instructions });
      } else {
        window.open(info.verificationUri, "_blank", "noopener");
        setNote(`Open ${info.verificationUri} and enter code: ${info.userCode}`);
      }
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
      return;
    }
    pollUntilConnected(p.id);
  };

  const submitCode = async () => {
    if (!pendingCode || !code.trim()) return;
    setNote("Verifying your code…");
    try {
      await client.completeLogin(pendingCode.id, code.trim());
      // Token exchange runs server-side; the poll flips to connected (or error).
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    }
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
        {pendingCode ? (
          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={ui.composerInput}
              placeholder="code#state"
              value={code}
              autoFocus
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitCode();
              }}
            />
            <button style={ui.sendBtn} disabled={!code.trim()} onClick={submitCode}>
              Submit
            </button>
          </div>
        ) : null}
        {note ? <p style={ui.note}>{note}</p> : null}
      </div>
    </div>
  );
}
