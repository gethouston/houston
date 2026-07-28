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
/**
 * Gateways whose event feed has already streamed at least once in this page's
 * lifetime — the "is this a reconnect?" memory behind the catch-up seam below.
 *
 * Module-scoped, NOT per-subscription, because the reconnect that matters most
 * replaces the subscription itself: a `401` refreshes the session, and
 * `setHostedEngineSessionToken` rebuilds the whole client (`_ws.disconnect()`
 * then `_ws.connect()`), so the stream that comes back after the longest gap —
 * the laptop that slept until its token expired — arrives on a BRAND-NEW
 * `subscribeEvents` call. A per-call counter restarted at zero there and the
 * one reconnect that had lost the most events was the one that stayed silent.
 *
 * Keyed by gateway, not by token or space: the token is exactly what changes
 * across a refresh, and the active space is mutated in place on the SAME
 * subscription (`cfg.activeOrgSlug`, read live per connect). Page lifetime is
 * the right scope on both ends — a real fresh boot starts with an empty set and
 * stays silent (its initial reads are already in flight), and nothing here
 * outlives the reload that would make the memory wrong.
 */
const streamedGateways = new Set<string>();

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
    // The catch-up seam (HOU-981). This feed has NO replay cursor: every event
    // emitted while the stream was down is lost for good, and the surfaces it
    // feeds are cached with a long freshness window — so a drop used to mean
    // the board silently stopped tracking reality until the next remount. On a
    // RE-connect we publish a transport event and let the app's invalidation
    // plan decide what to re-read (app/src/lib/agent-invalidation-plan.ts);
    // the adapter stays out of the cache-policy business. The first connect to
    // a gateway this page has never streamed is skipped — that read is already
    // in flight. See `streamedGateways` for why the memory outlives the
    // subscription.
    onConnect: () => {
      if (streamedGateways.has(cfg.baseUrl)) {
        onEvent({ type: "EventStreamReconnected" });
        return;
      }
      streamedGateways.add(cfg.baseUrl);
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
