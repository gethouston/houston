import { useSyncExternalStore } from "react";

const MINUTE = 60_000;
const listeners = new Set<() => void>();
let now = Date.now();
let timer: ReturnType<typeof setTimeout> | undefined;

function tick() {
  now = Date.now();
  for (const listener of listeners) listener();
  timer = setTimeout(tick, MINUTE - (Date.now() % MINUTE));
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    now = Date.now();
    timer = setTimeout(tick, MINUTE - (now % MINUTE));
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

const snapshot = () => now;
const serverSnapshot = () => Date.now();

/** All relative-time labels share one minute-aligned presentation clock. */
export function usePresentationNow(): number {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
