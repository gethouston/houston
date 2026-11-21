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

const AppTree = lazy(() => import("../app-tree"));

export function WebApp({
  baseUrl,
  token,
  cloud,
  onChangeEngine,
}: {
  baseUrl: string;
  token?: string;
  cloud?: boolean;
  onChangeEngine?: () => void;
}) {
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
              <button
                type="button"
                style={ui.pageButton}
                onClick={onChangeEngine}
              >
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
