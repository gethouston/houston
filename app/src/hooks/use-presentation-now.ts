import { useSyncExternalStore } from "react";

const MINUTE = 60_000;
const listeners = new Set<() => void>();
let now = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

function tick() {
  now = serverSnapshot();
  timer = setTimeout(tick, MINUTE - (Date.now() % MINUTE));
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    now = serverSnapshot();
    timer = setTimeout(tick, MINUTE - (Date.now() % MINUTE));
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
}

const serverSnapshot = () => Math.floor(Date.now() / MINUTE) * MINUTE;
const snapshot = () => (listeners.size === 0 ? serverSnapshot() : now);

/** All relative-time labels share one minute-aligned presentation clock. */
export function usePresentationNow(): number {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
