import type {
  HoustonEngineClient,
  ProviderId,
  ProviderInfo,
} from "@houston/runtime-client";
import { type CSSProperties, useEffect, useState } from "react";
import { ui } from "./styles";

// ChatGPT security settings, where device-code sign-in is toggled on. The
// most common device-login dead-end is that switch being off.
const CHATGPT_SECURITY_URL = "https://chatgpt.com/#settings/Security";

// Inline text link, matching the card's dark-on-dark palette. This surface
// paints before app CSS loads, so it carries its own styles (see styles.ts).
const linkStyle: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  font: "inherit",
  color: "#9a9cff",
  textDecoration: "underline",
  cursor: "pointer",
};

const codeBoxStyle: CSSProperties = {
  ...ui.input,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: 52,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 22,
  letterSpacing: "0.3em",
};

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
  const [pendingCode, setPendingCode] = useState<{
    id: ProviderId;
    hint?: string;
  } | null>(null);
  const [code, setCode] = useState("");
  // Set for the Codex/ChatGPT device-code flow: the one-time code the user
  // types on the verification page (opened automatically) to finish sign-in.
  const [deviceCode, setDeviceCode] = useState<{
    code: string;
    verificationUri: string;
  } | null>(null);
  const [deviceCopied, setDeviceCopied] = useState(false);

  useEffect(() => {
    client
      .listProviders()
      .then(setProviders)
      .catch(() => setNote("Could not reach the engine."));
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
          setDeviceCode(null);
          setNote(`Login failed: ${pr.login.error}`);
        }
      } catch {
        /* transient; keep polling */
      }
    }, 1500);
  };

  const connect = async (p: ProviderInfo) => {
    setNote(`Starting ${p.name} login…`);
    setPendingCode(null);
    setDeviceCode(null);
    setDeviceCopied(false);
    setCode("");
    try {
      const info = await client.startLogin(p.id);
      if (info.kind === "url") {
        window.open(info.url, "_blank", "noopener");
        setNote("Authorize in the new tab, then come back here.");
      } else if (info.kind === "auth_code") {
        window.open(info.url, "_blank", "noopener");
        setNote(
          info.instructions ??
            "Approve in the new tab, then paste the code Claude shows.",
        );
        setPendingCode({ id: p.id, hint: info.instructions });
      } else {
        // Device code: open the verification page now and show the code with a
        // one-click copy affordance. pollUntilConnected auto-advances on success.
        window.open(info.verificationUri, "_blank", "noopener");
        setDeviceCode({
          code: info.userCode,
          verificationUri: info.verificationUri,
        });
        setNote("Waiting for you to authorize in the new tab…");
      }
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
      return;
    }
    pollUntilConnected(p.id);
  };

  const copyDeviceCode = async () => {
    if (!deviceCode) return;
    try {
      await navigator.clipboard.writeText(deviceCode.code);
      setDeviceCopied(true);
      setTimeout(() => setDeviceCopied(false), 2000);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    }
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
            type="button"
            style={{
              ...ui.button,
              ...(p.configured ? { background: "#2a2a2a" } : {}),
            }}
            disabled={p.configured}
            onClick={() => connect(p)}
          >
            {p.configured ? `✓ ${p.name} connected` : `Connect ${p.name}`}
          </button>
        ))}
        {deviceCode ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={codeBoxStyle}>{deviceCode.code}</div>
            <button type="button" style={ui.button} onClick={copyDeviceCode}>
              {deviceCopied ? "Code copied!" : "Copy code"}
            </button>
            <p style={ui.note}>
              Enter this code on the ChatGPT tab that opened.{" "}
              <button
                type="button"
                style={linkStyle}
                onClick={() =>
                  window.open(deviceCode.verificationUri, "_blank", "noopener")
                }
              >
                Open the page again
              </button>
            </p>
            <p style={ui.note}>
              Not seeing a code prompt? Turn on device-code sign-in in ChatGPT
              Settings {">"} Security.{" "}
              <button
                type="button"
                style={linkStyle}
                onClick={() =>
                  window.open(CHATGPT_SECURITY_URL, "_blank", "noopener")
                }
              >
                Open settings
              </button>
            </p>
          </div>
        ) : null}
        {pendingCode ? (
          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={ui.composerInput}
              placeholder="code#state"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitCode();
              }}
            />
            <button
              type="button"
              style={ui.sendBtn}
              disabled={!code.trim()}
              onClick={submitCode}
            >
              Submit
            </button>
          </div>
        ) : null}
        {note ? <p style={ui.note}>{note}</p> : null}
      </div>
    </div>
  );
}
