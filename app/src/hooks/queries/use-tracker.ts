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
  TrackerIssue,
  TrackerProvider,
  TrackerReconcileResponse,
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

function trackerIssuesKey(
  provider: TrackerProvider,
  workspacePath: string | undefined,
) {
  return ["tracker", provider, workspacePath ?? "", "issues"] as const;
}

/**
 * Read the on-disk projection of issues. Refetches every 5s while a
 * connection is `connecting` (so the count fills in as the initial
 * reconcile lands) and stays static otherwise (30s stale; manual
 * refetch via Sync-now or status-driven invalidation).
 */
export function useTrackerIssues(
  provider: TrackerProvider,
  workspacePath: string | undefined,
  connecting: boolean,
) {
  return useQuery({
    queryKey: trackerIssuesKey(provider, workspacePath),
    queryFn: () => tauriTrackers.listIssues(provider, workspacePath!),
    enabled: !!workspacePath,
    staleTime: STALE_MS,
    refetchInterval: connecting ? 5_000 : false,
  });
}

/**
 * Trigger a manual reconcile. On success, invalidate the issues query
 * so the new projection lands immediately in the UI.
 */
export function useTrackerSyncNow(
  provider: TrackerProvider,
  workspacePath: string | undefined,
) {
  const qc = useQueryClient();
  return useMutation<TrackerReconcileResponse, Error, void>({
    mutationFn: () => tauriTrackers.syncNow(provider, workspacePath!),
    onSuccess: () => {
      if (workspacePath) {
        qc.invalidateQueries({
          queryKey: trackerIssuesKey(provider, workspacePath),
        });
        qc.invalidateQueries({
          queryKey: trackerStatusKey(provider, workspacePath),
        });
      }
    },
  });
}

// Re-export Issue + reconcile types so consumers don't have to dual-
// import from engine-client.
export type { TrackerIssue, TrackerReconcileResponse };
