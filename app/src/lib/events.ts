import type { HoustonEvent } from "@houston-ai/core";
import { getEngineWs } from "./engine";
import { showErrorToast } from "./error-toast";
import { legacyEmit, legacyListen } from "./os-bridge";

type Unsub = () => void;

function toHandler<T>(handler: (ev: T) => void) {
  return (payload: unknown) => handler(payload as T);
}

const localHandlers = new Set<(ev: HoustonEvent) => void>();

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

export function publishLocalHoustonEvent(ev: HoustonEvent): void {
  for (const handler of localHandlers) handler(ev);
}

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

export function emitOsEvent(event: string, payload?: unknown): Promise<void> {
  return legacyEmit(event, payload);
}
