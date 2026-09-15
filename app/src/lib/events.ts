/**
 * Unified subscription helpers.
 *
 * Every `HoustonEvent` the host emits reaches every handler — the engine's
 * event stream is unfiltered and each event carries the agent/session it
 * belongs to, so the UI routes on the payload rather than on a subscription.
 * The only calls that still use Tauri IPC are OS-level events
 * (`app-activated`, `sync-connection`) the webview emits locally without going
 * through the engine.
 *
 * Callers should NOT import `listen` from `@tauri-apps/api/event` — go
 * through this module so any future transport switch stays in one place.
 */

import type { HoustonEvent } from "@houston-ai/core";
import { getEngineWs } from "./engine";
import { showErrorToast } from "./error-toast";
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
 * Subscribe to every `HoustonEvent` emitted by the backend. Each UI hook that
 * mounts adds its own handler; the stream itself is opened once.
 */
export function subscribeHoustonEvents(
  handler: (ev: HoustonEvent) => void,
): Unsub {
  const offWs = getEngineWs().onEvent(toHandler(handler));
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
  let disposed = false;
  legacyListen<T>(event, (tauriEv) => {
    if (!disposed) handler(tauriEv.payload);
  })
    .then((fn) => {
      if (disposed) fn();
      else off = fn;
    })
    .catch((error: unknown) => {
      showErrorToast(
        "os_event_subscribe",
        "OS event subscription failed",
        error,
      );
    });
  return () => {
    disposed = true;
    off?.();
  };
}

/** Re-export `legacyEmit` so callers don't need to reach into os-bridge. */
export function emitOsEvent(event: string, payload?: unknown): Promise<void> {
  return legacyEmit(event, payload);
}
