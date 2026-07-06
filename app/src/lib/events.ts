/**
 * Unified subscription helpers.
 *
 * Events flow over the engine WebSocket (topic-scoped). The only calls that
 * still use Tauri IPC are OS-level events (`app-activated`, `sync-connection`)
 * that the webview emits locally without going through the engine.
 *
 * Callers should NOT import `listen` from `@tauri-apps/api/event` — go
 * through this module so any future transport switch stays in one place.
 *
 * Topic model: the desktop app subscribes to the engine's firehose (`"*"`),
 * which matches every scoped topic on the server side (see
 * `engine/houston-engine-server/src/ws.rs`). Narrower clients (headless
 * agents, mobile) should add targeted subscribe helpers instead of using
 * the firehose so they don't waste bandwidth.
 */

import type { HoustonEvent } from "@houston-ai/core";
import { topics } from "@houston-ai/engine-client";
import { getEngineWs } from "./engine";
import { legacyEmit, legacyListen } from "./os-bridge";

type Unsub = () => void;

function toHandler<T>(handler: (ev: T) => void) {
  return (payload: unknown) => handler(payload as T);
}

/**
 * The set of live `subscribeHoustonEvents` handlers, so a purely LOCAL flow can
 * fan an event out to the exact same subscribers the engine WS feeds. The
 * desktop Claude browser login completes entirely on this machine (no runtime
 * round-trip), so it has no server `ProviderLoginComplete` to ride — it
 * publishes a synthetic one here and every provider surface reacts identically.
 */
const localHandlers = new Set<(ev: HoustonEvent) => void>();

/**
 * Subscribe to every `HoustonEvent` emitted by the backend.
 *
 * Idempotent: calling this multiple times is safe — the underlying
 * `EngineWebSocket` de-duplicates subscriptions, so the firehose topic is
 * added once regardless of how many UI hooks mount.
 */
export function subscribeHoustonEvents(
  handler: (ev: HoustonEvent) => void,
): Unsub {
  const ws = getEngineWs();
  ws.subscribe([topics.firehose]);
  const offWs = ws.onEvent(toHandler(handler));
  localHandlers.add(handler);
  return () => {
    offWs();
    localHandlers.delete(handler);
  };
}

/**
 * Deliver a client-synthesized `HoustonEvent` to every `subscribeHoustonEvents`
 * subscriber, exactly as if the engine had emitted it. ONLY for flows that
 * genuinely complete client-side (the desktop Claude browser login) — everything
 * else must come from the engine so state stays authoritative.
 */
export function publishLocalHoustonEvent(ev: HoustonEvent): void {
  for (const handler of localHandlers) handler(ev);
}

/**
 * Listen to a raw Tauri event. Use for events that have no engine counterpart:
 * - `app-activated` (OS window resume)
 */
export function listenOsEvent<T>(
  event: string,
  handler: (ev: T) => void,
): Unsub {
  let off: Unsub | undefined;
  legacyListen<T>(event, (tauriEv) => handler(tauriEv.payload))
    .then((fn) => {
      off = fn;
    })
    .catch(() => {});
  return () => {
    off?.();
  };
}

/** Re-export `legacyEmit` so callers don't need to reach into os-bridge. */
export function emitOsEvent(event: string, payload?: unknown): Promise<void> {
  return legacyEmit(event, payload);
}
