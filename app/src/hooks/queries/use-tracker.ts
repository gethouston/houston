/**
 * Tracker (Linear in V1) connection lifecycle hooks.
 *
 * Owns the user-visible "Connect Linear" flow:
 *   1. `useTrackerConnect` mutation → engine returns `{authorizeUrl}` →
 *      caller opens it in the user's default browser via `osOpenUrl`.
 *   2. Engine receives Linear's redirect on its loopback callback port,
 *      finishes the OAuth dance, writes `connection.json`.
 *   3. `useTrackerStatus` polls every 2s while state === "connecting"
 *      and shows the connected org once `connection.json` lands.
 *
 * Engine events for `tracker:<provider>:<workspace>` will replace the
 * polling once they're wired (post-C3) — the hook signature stays.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  TrackerConnectRequest,
  TrackerConnectResponse,
  TrackerProvider,
  TrackerStatusResponse,
} from "@houston-ai/engine-client";
import { tauriTrackers } from "../../lib/tauri";

const STALE_MS = 30_000;

function trackerStatusKey(
  provider: TrackerProvider,
  workspacePath: string | undefined,
) {
  return ["tracker", provider, workspacePath ?? "", "status"] as const;
}

/**
 * Read the connection state for `workspacePath`. Polls every 2s while
 * the engine reports `state === "connecting"`; static otherwise (CI
 * caching takes over). Returns `undefined` before first load so
 * call sites can distinguish "loading" from "loaded NotConnected".
 */
export function useTrackerStatus(
  provider: TrackerProvider,
  workspacePath: string | undefined,
) {
  return useQuery({
    queryKey: trackerStatusKey(provider, workspacePath),
    queryFn: () => tauriTrackers.status(provider, workspacePath!),
    enabled: !!workspacePath,
    staleTime: STALE_MS,
    refetchInterval: (query) => {
      const data = query.state.data as TrackerStatusResponse | undefined;
      return data?.state === "connecting" ? 2_000 : false;
    },
  });
}

/**
 * Start the OAuth flow. The mutation returns `{authorizeUrl, state,
 * callbackPort}` — caller opens the URL via `osOpenUrl`. The engine
 * runs the dance in the background; the status query picks up the
 * `connecting → connected` transition on its next poll.
 */
export function useTrackerConnect(
  provider: TrackerProvider,
  workspacePath: string | undefined,
) {
  const qc = useQueryClient();
  return useMutation<TrackerConnectResponse, Error, TrackerConnectRequest>({
    mutationFn: (req) => tauriTrackers.connect(provider, req),
    onSuccess: () => {
      // Force a status refetch immediately so the UI flips to
      // "connecting" without waiting for the next 2s tick.
      if (workspacePath) {
        qc.invalidateQueries({
          queryKey: trackerStatusKey(provider, workspacePath),
        });
      }
    },
  });
}

/**
 * Disconnect: revokes the keychain entry and deletes `connection.json`.
 * Idempotent on the engine side — duplicate clicks resolve cleanly.
 */
export function useTrackerDisconnect(
  provider: TrackerProvider,
  workspacePath: string | undefined,
) {
  const qc = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: () => tauriTrackers.disconnect(provider, workspacePath!),
    onSuccess: () => {
      if (workspacePath) {
        qc.invalidateQueries({
          queryKey: trackerStatusKey(provider, workspacePath),
        });
      }
    },
  });
}
