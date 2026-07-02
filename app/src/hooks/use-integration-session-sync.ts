import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { newEngineActive, onEngineRestarted } from "../lib/engine";
import { queryKeys } from "../lib/query-keys";
import { tauriIntegrations } from "../lib/tauri";
import { useSession } from "./use-session";

/**
 * Keeps the local host's integrations gateway supplied with the user's current
 * Supabase access token (platform-mode Composio: the desktop holds no provider
 * key — Houston's cloud host does — so every integration call is forwarded
 * with this session and the cloud derives the user from the verified JWT).
 *
 * Pushes on sign-in, on Supabase's own token refresh, null on sign-out, and
 * re-pushes the current token whenever the engine supervisor respawns the
 * sidecar — the host holds the session in-process, so a restart silently
 * drops it and every integration call would 401 until the next token change.
 * Mounted once in <App/> (below the EngineGate, so the engine is ready).
 * No-ops on the legacy Rust wire and on deployments without a session sink
 * (the adapter treats the missing route as a benign 404).
 */
export function useIntegrationSessionSync(): void {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const token = session?.access_token ?? null;
  // Don't push the initial null (fresh boot, nothing to clear) — only a real
  // token, or null AFTER a token (sign-out).
  const pushedToken = useRef(false);

  const push = (value: string | null) => {
    tauriIntegrations
      .setSession(value)
      .then(() => {
        // Readiness likely flipped (signin ↔ ready) — refresh the tab's view.
        qc.invalidateQueries({ queryKey: queryKeys.integrationStatus() });
      })
      .catch(() => {
        // Already surfaced by call() (red toast + Report bug); the
        // Integrations tab independently shows the sign-in-needed state.
      });
  };
  const pushRef = useRef(push);
  pushRef.current = push;

  useEffect(() => {
    if (!newEngineActive()) return;
    if (token === null && !pushedToken.current) return;
    pushedToken.current = token !== null;
    pushRef.current(token);
  }, [token]);

  // Sidecar respawn (the `houston-engine-restarted` signal, surfaced through
  // `onEngineRestarted` exactly like use-agent-invalidation): the fresh host
  // process holds no session, so re-push the current token. The listener never
  // fires on web/remote builds — engine.ts only installs the Tauri lifecycle
  // listeners in local desktop mode — so no extra platform guard is needed.
  const tokenRef = useRef(token);
  tokenRef.current = token;
  useEffect(
    () =>
      onEngineRestarted(() => {
        if (!newEngineActive()) return;
        if (tokenRef.current === null) return; // Fresh host, nothing to clear.
        pushRef.current(tokenRef.current);
      }),
    [],
  );
}
