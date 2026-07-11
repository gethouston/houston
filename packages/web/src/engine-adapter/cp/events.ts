import { streamGlobalEvents } from "@houston/runtime-client";
import { refreshLiveToken } from "../session-refresh";
import { type ControlPlaneConfig, liveToken } from "./fetch";

/**
 * Subscribe to the host's global reactivity stream (`GET /v1/events`, SSE).
 *
 * A thin consumer of the shared `streamGlobalEvents` loop
 * (`@houston/runtime-client`), which uses fetch + a ReadableStream reader, NOT
 * `EventSource`: in the Tauri desktop webview a cross-origin `EventSource` to
 * the host silently never connects, so the desktop would get zero reactivity
 * (the board/routines/etc. only refresh on navigation). fetch streaming works
 * in both the webview and the browser — it's the same transport the chat stream
 * already relies on.
 *
 * This adapter keeps only its own two seams: the token rides in the query (the
 * host's bearer reads `?token=`, re-embedded per (re)connect so a refreshed
 * token is always current) — and, in a hosted team space, the active-space
 * slug rides beside it as `?org=<slug>` (C8 §Active space: browsers can't set
 * headers on a stream, so the gateway's two SSE routes accept the selector as a
 * query param). Both are re-read per (re)connect. Host events
 * `{ type, agentPath, workspaceId }`
 * are translated to the shape the UI's invalidation map reads
 * (`{ type, data: { agent_path, workspace_id } }`). Malformed frames are
 * dropped and the loop reconnects with a short backoff on any drop. A `401`
 * forces a session refresh (single-flight, HOU-687) so the next attempt's
 * re-read of `liveToken` carries a valid bearer — without it, an expired token
 * would 401-loop forever because nothing else re-mints while the app idles.
 */
export function subscribeEvents(
  cfg: ControlPlaneConfig,
  onEvent: (event: unknown) => void,
): () => void {
  const ac = new AbortController();
  void streamGlobalEvents({
    url: () => {
      const org = cfg.activeOrgSlug;
      const orgParam = org ? `&org=${encodeURIComponent(org)}` : "";
      return `${cfg.baseUrl}/v1/events?token=${encodeURIComponent(
        liveToken(cfg.token),
      )}${orgParam}`;
    },
    // Wrapped, never the bare reference: streamGlobalEvents calls
    // `opts.fetch(...)`, and a browser's window.fetch invoked with a foreign
    // receiver throws "Illegal invocation" BEFORE any request goes out — the
    // stream then silently retry-looped forever and no server event ever
    // reached the app (agent-written routines/skills/files never refreshed).
    // Node's fetch is receiver-agnostic, so unit tests never caught it.
    fetch: (input, init) => fetch(input, init),
    signal: ac.signal,
    onUnauthorized: () => {
      void refreshLiveToken();
    },
    // Log-only (no toast): a background stream that auto-reconnects — but it
    // must never fail silently again.
    onError: (err) => console.warn("[events] global stream error:", err),
    onEvent: (data) =>
      onEvent(
        toInvalidationEvent(
          data as { type: string; agentPath?: string; workspaceId?: string },
        ),
      ),
  });
  return () => ac.abort();
}

/**
 * Translate a host global-events frame (`{ type, agentPath, workspaceId }`) into
 * the shape the app's invalidation map reads
 * (`{ type, data: { agent_path, workspace_id } }`, see
 * `app/src/hooks/use-agent-invalidation.ts`).
 *
 * Exported as the ONE source of that shape so the adapter's write-through echo
 * (`bus.emitLocalEcho`) can be verified to produce byte-identical events — a
 * locally synthesized echo and a real server frame must be indistinguishable to
 * the invalidation hook, or one of them silently no-ops.
 */
export function toInvalidationEvent(frame: {
  type: string;
  agentPath?: string;
  workspaceId?: string;
}): { type: string; data: { agent_path?: string; workspace_id?: string } } {
  return {
    type: frame.type,
    data: { agent_path: frame.agentPath, workspace_id: frame.workspaceId },
  };
}
