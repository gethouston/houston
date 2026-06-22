import { useState } from "react";
import type { EngineConfig } from "../lib/config";

interface Props {
  error?: string;
  /** Previously-attempted config, so the form pre-fills after a failed auto-connect. */
  defaults?: EngineConfig;
  onConnect: (baseUrl: string, token: string) => Promise<void>;
}

export function ConnectScreen({ error, defaults, onConnect }: Props) {
  const [baseUrl, setBaseUrl] = useState(
    defaults?.baseUrl ?? "http://127.0.0.1:7777",
  );
  const [token, setToken] = useState(defaults?.token ?? "");
  const [submitting, setSubmitting] = useState(false);

  const disabled = submitting || !baseUrl.trim() || !token.trim();

  return (
    <div className="screen screen--center">
      <div className="connect-card">
        <div className="brand brand--large">
          <Logo />
          <span>SmartBooks</span>
        </div>
        <p className="muted">
          {error
            ? "Couldn't reach the engine. Check the URL + token below and try again."
            : "Drop a bank statement in, get a clean workbook back."}
          {" Built on "}
          <a href="https://gethouston.ai" target="_blank" rel="noreferrer">
            Houston Engine
          </a>
          .
        </p>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            if (disabled) return;
            setSubmitting(true);
            onConnect(baseUrl.trim(), token.trim()).finally(() =>
              setSubmitting(false),
            );
          }}
        >
          <label className="field">
            <span>Engine URL</span>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://127.0.0.1:7777"
              autoComplete="off"
              spellCheck={false}
              required
            />
          </label>
          <label className="field">
            <span>Bearer token</span>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="from ~/.houston/engine.json or your .env"
              autoComplete="off"
              spellCheck={false}
              required
            />
          </label>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={disabled}
          >
            {submitting ? "Connecting…" : "Connect"}
          </button>
          {error && <p className="error">{error}</p>}
        </form>
        <details className="help">
          <summary>How do I find these?</summary>
          <p>
            Start the engine locally with{" "}
            <code>
              HOUSTON_ENGINE_TOKEN=your-token cargo run -p houston-engine-server
              --bin houston-engine
            </code>{" "}
            — it prints the port on stdout and writes a manifest to{" "}
            <code>~/.houston/engine.json</code>. Or point this at any remote
            deployment running the same binary (e.g. Houston Always On).
          </p>
        </details>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" fill="#0f6b4f" />
      <path
        d="M7 15 L10 10 L13 13 L17 8"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
