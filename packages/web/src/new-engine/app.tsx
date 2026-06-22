import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { HoustonEngineClient, type AuthStatus } from "@houston/runtime-client";
import { ConnectView } from "./connect";
import { ui } from "./styles";

// The full Houston desktop UI. Lazily imported so its module graph (and the
// engine-adapter behind @houston-ai/engine-client) only evaluates after the
// engine config global is set and a provider is connected.
const AppTree = lazy(() => import("../app-tree"));

/**
 * Boots the desktop UI on the new engine. First gate: a subscription provider
 * (Claude / Codex) must be connected via OAuth — otherwise chat can't run.
 * Once connected, the real desktop tree mounts and talks to the new engine
 * through the adapter.
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
  const client = useMemo(
    () => new HoustonEngineClient({ baseUrl, token }),
    [baseUrl, token],
  );
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    client
      .authStatus()
      .then((s) => {
        setStatus(s);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));

  // Cloud is keyless (Supabase auth + control-plane credentials): there is no
  // per-runtime OAuth gate, so skip the auth probe and mount the app directly.
  useEffect(() => {
    if (!cloud) void refresh();
  }, [client, cloud]);

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
              <button style={ui.button} onClick={onChangeEngine}>
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
  if (!status.activeProvider) {
    return <ConnectView client={client} onConnected={refresh} />;
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
