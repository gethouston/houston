/**
 * First-run Connect screen for the web app.
 *
 * A browser tab has no Tauri supervisor to mint an engine endpoint, so the user
 * points the web app at a running houston-engine (base URL + token). We validate
 * the pair with a real authenticated call before persisting, so a bad URL/token
 * surfaces here instead of hanging the EngineGate splash forever.
 *
 * Self-contained inline styles + a tiny en/es/pt string map: this screen renders
 * in the entry chunk, BEFORE the lazy app chunk (and its i18n stack + theme CSS)
 * loads, so it can't use `t()` or Tailwind classes.
 */

import { HoustonClient } from "@houston-ai/engine-client";
import { type CSSProperties, type FormEvent, useState } from "react";
import type { EngineConfig } from "../engine-config";

interface Strings {
  subtitle: string;
  urlLabel: string;
  tokenLabel: string;
  tokenPlaceholder: string;
  connect: string;
  connecting: string;
  missing: string;
  failedGeneric: string;
  failed: (message: string) => string;
  hint: string;
}

const STRINGS: Record<"en" | "es" | "pt", Strings> = {
  en: {
    subtitle: "Connect to your Houston engine",
    urlLabel: "Engine URL",
    tokenLabel: "Engine token",
    tokenPlaceholder: "paste the engine token",
    connect: "Connect",
    connecting: "Connecting…",
    missing: "Enter the engine URL and token.",
    failedGeneric: "Could not connect. Check the URL and token.",
    failed: (m) => `Could not connect: ${m}`,
    hint: "The engine prints its URL and token on startup:",
  },
  es: {
    subtitle: "Conéctate a tu motor de Houston",
    urlLabel: "URL del motor",
    tokenLabel: "Token del motor",
    tokenPlaceholder: "pega el token del motor",
    connect: "Conectar",
    connecting: "Conectando…",
    missing: "Ingresa la URL y el token del motor.",
    failedGeneric: "No se pudo conectar. Revisa la URL y el token.",
    failed: (m) => `No se pudo conectar: ${m}`,
    hint: "El motor muestra su URL y token al iniciar:",
  },
  pt: {
    subtitle: "Conecte-se ao seu motor do Houston",
    urlLabel: "URL do motor",
    tokenLabel: "Token do motor",
    tokenPlaceholder: "cole o token do motor",
    connect: "Conectar",
    connecting: "Conectando…",
    missing: "Informe a URL e o token do motor.",
    failedGeneric: "Não foi possível conectar. Verifique a URL e o token.",
    failed: (m) => `Não foi possível conectar: ${m}`,
    hint: "O motor mostra a URL e o token ao iniciar:",
  },
};

function resolveStrings(): Strings {
  const lang = (typeof navigator !== "undefined" ? navigator.language : "en")
    .slice(0, 2)
    .toLowerCase();
  if (lang === "es") return STRINGS.es;
  if (lang === "pt") return STRINGS.pt;
  return STRINGS.en;
}

export function ConnectScreen({
  onConnect,
}: {
  onConnect: (config: EngineConfig) => void;
}) {
  const [baseUrl, setBaseUrl] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = resolveStrings();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const url = baseUrl.trim().replace(/\/+$/, "");
    const tok = token.trim();
    if (!url || !tok) {
      setError(t.missing);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Validates reachability (CORS + network) AND the token (401 throws).
      await new HoustonClient({ baseUrl: url, token: tok }).listWorkspaces();
      onConnect({ baseUrl: url, token: tok });
    } catch (err) {
      setError(err instanceof Error ? t.failed(err.message) : t.failedGeneric);
      setBusy(false);
    }
  };

  return (
    <div style={styles.page}>
      <form style={styles.card} onSubmit={submit}>
        <div style={styles.brand}>Houston</div>
        <p style={styles.subtitle}>{t.subtitle}</p>

        <label style={styles.label}>
          {t.urlLabel}
          <input
            style={styles.input}
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="http://127.0.0.1:7777"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            disabled={busy}
          />
        </label>

        <label style={styles.label}>
          {t.tokenLabel}
          <input
            style={styles.input}
            type="password"
            autoComplete="off"
            placeholder={t.tokenPlaceholder}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={busy}
          />
        </label>

        {error ? (
          <p style={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        <button style={styles.button} type="submit" disabled={busy}>
          {busy ? t.connecting : t.connect}
        </button>

        <p style={styles.hint}>
          {t.hint}{" "}
          <code style={styles.code}>
            HOUSTON_ENGINE_LISTENING port=… token=…
          </code>
        </p>
      </form>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    background: "#0d0d0d",
    color: "#f5f5f5",
    fontFamily: "system-ui, -apple-system, sans-serif",
    padding: 24,
  },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    width: "100%",
    maxWidth: 380,
    padding: 32,
    borderRadius: 16,
    background: "#161616",
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
  },
  brand: { fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" },
  subtitle: { margin: 0, fontSize: 14, color: "#9a9a9a" },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontSize: 12,
    fontWeight: 500,
    color: "#bdbdbd",
  },
  input: {
    height: 40,
    padding: "0 12px",
    borderRadius: 9,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#0d0d0d",
    color: "#f5f5f5",
    fontSize: 14,
    outline: "none",
  },
  error: { margin: 0, fontSize: 13, color: "#ff6b6b" },
  button: {
    height: 42,
    marginTop: 4,
    borderRadius: 9999,
    border: "none",
    background: "#f5f5f5",
    color: "#0d0d0d",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  hint: { margin: 0, fontSize: 11, lineHeight: 1.5, color: "#6f6f6f" },
  code: { fontFamily: "ui-monospace, Menlo, monospace", fontSize: 10.5 },
};
