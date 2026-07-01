/**
 * Engine Connect screen for the NEW TS engine. The browser has no supervisor to
 * mint an endpoint, so the user points the web app at a running houston-engine
 * (base URL + optional token). We validate with a real `authStatus()` call
 * before persisting, so a bad/unreachable URL or wrong token surfaces here
 * instead of failing deep in the app. Self-contained inline styles: this renders
 * in the entry chunk, before the app's Tailwind/i18n stack loads.
 */

import { HoustonEngineClient } from "@houston/runtime-client";
import { type FormEvent, useState } from "react";
import type { EngineConfig } from "../engine-config";
import { ui } from "./styles";

export function EngineConnectScreen({
  onConnect,
}: {
  onConnect: (config: EngineConfig) => void;
}) {
  const [baseUrl, setBaseUrl] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const url = baseUrl.trim().replace(/\/+$/, "");
    const tok = token.trim();
    if (!url) {
      setError("Enter the engine URL.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Validates reachability (HTTPS + CORS) AND the token (401 throws).
      await new HoustonEngineClient({
        baseUrl: url,
        token: tok || undefined,
      }).authStatus();
      onConnect({ baseUrl: url, token: tok });
    } catch (err) {
      setError(
        err instanceof Error
          ? `Could not connect: ${err.message}`
          : "Could not connect. Check the URL and token.",
      );
      setBusy(false);
    }
  };

  return (
    <div style={ui.page}>
      <form style={ui.card} onSubmit={submit}>
        <div style={ui.brand}>🚀 Houston</div>
        <p style={ui.subtitle}>Connect to your Houston engine</p>

        <label style={ui.label}>
          Engine URL
          <input
            style={ui.input}
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://your-engine.example.com"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            disabled={busy}
          />
        </label>

        <label style={ui.label}>
          Engine token (optional)
          <input
            style={ui.input}
            type="password"
            autoComplete="off"
            placeholder="paste the engine token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={busy}
          />
        </label>

        {error ? (
          <p style={ui.error} role="alert">
            {error}
          </p>
        ) : null}

        <button style={ui.button} type="submit" disabled={busy}>
          {busy ? "Connecting…" : "Connect"}
        </button>
      </form>
    </div>
  );
}
