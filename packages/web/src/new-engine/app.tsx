import { type AuthStatus, HoustonEngineClient } from "@houston/runtime-client";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ui } from "./styles";

// The full Houston desktop UI. Lazily imported so its module graph (and the
// engine-adapter behind @houston-ai/engine-client) only evaluates after the
// engine config global is set and a provider is connected.
const AppTree = lazy(() => import("../app-tree"));

/**
 * Boots the desktop UI on the new engine. The gate is a REACHABILITY check
 * only: one authStatus probe against the host's pre-agent /setup-runtime
 * surface proves the URL + token work, then the app tree mounts. Connecting a
 * provider is owned by the app itself — first-run onboarding's "Connect your
 * AI" step (curated ProviderBrowser), and the in-app reconnect cards after
 * that — so an unconnected engine must still boot to the shell.
 */
export function WebApp({
  baseUrl,
  token,
  cloud,
  onChangeEngine,
}: {
  baseUrl: string;
  token?: string;
  /** Cloud (control-plane) mode: skip the per-runtime OAuth gate. */
  cloud?: boolean;
  onChangeEngine?: () => void;
}) {
  // The pre-agent connect surface lives under the host's /setup-runtime/*
  // (auth/status, providers, the OAuth login routes) — the host serves no flat
  // /auth/status. The app itself keeps talking to the bare baseUrl through the
  // engine adapter; only this gate speaks setup-runtime.
  const client = useMemo(
    () =>
      new HoustonEngineClient({ baseUrl: `${baseUrl}/setup-runtime`, token }),
    [baseUrl, token],
  );
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    () =>
      client
        .authStatus()
        .then((s) => {
          setStatus(s);
          setError(null);
        })
        .catch((e) => setError(e instanceof Error ? e.message : String(e))),
    [client],
  );

  // Cloud is keyless (Supabase auth + control-plane credentials): there is no
  // per-runtime OAuth gate, so skip the auth probe and mount the app directly.
  useEffect(() => {
    if (!cloud) void refresh();
  }, [cloud, refresh]);

  if (cloud) {
    return (
      <Suspense
        fallback={
          <div style={ui.page}>
            <div style={ui.muted}>Loading Houston…</div>
          </div>
        }
      >
        <AppTree />
      </Suspense>
    );
  }

  if (error && !status) {
    return (
      <div style={ui.page}>
        <div style={ui.muted}>
          Can't reach the engine at <code>{baseUrl}</code>.
          <br />
          Make sure it's running and reachable over HTTPS, then retry.
          <br />
          <span style={{ opacity: 0.6 }}>{error}</span>
          {onChangeEngine ? (
            <>
              <br />
              <br />
              <button type="button" style={ui.button} onClick={onChangeEngine}>
                Use a different engine
              </button>
            </>
          ) : null}
        </div>
      </div>
    );
  }
  if (!status) {
    return (
      <div style={ui.page}>
        <div style={ui.muted}>Connecting to engine…</div>
      </div>
    );
  }
  return (
    <Suspense
      fallback={
        <div style={ui.page}>
          <div style={ui.muted}>Loading Houston…</div>
        </div>
      }
    >
      <AppTree />
    </Suspense>
  );
}
