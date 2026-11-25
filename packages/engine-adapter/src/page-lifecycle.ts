import type { PageLifecycle } from "@houston/sdk";

export interface PageLifecycleTarget {
  addEventListener(
    type: "beforeunload" | "pagehide" | "pageshow" | "visibilitychange",
    handler: () => void,
  ): void;
  isVisible(): boolean;
}

export const UNLOAD_CANCELLED_AFTER_MS = 2_000;

export function pageTargetOf(candidate: unknown): PageLifecycleTarget | null {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    typeof (candidate as Window).addEventListener !== "function"
  )
    return null;
  const w = candidate as Window;
  return {
    addEventListener: (type, handler) => w.addEventListener(type, handler),
    isVisible: () =>
      typeof document === "undefined" || document.visibilityState === "visible",
  };
}

export function createPageLifecycle(
  target: PageLifecycleTarget | null = pageTargetOf(
    typeof window === "undefined" ? null : window,
  ),
  schedule: (fn: () => void, ms: number) => () => void = (fn, ms) => {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  },
): PageLifecycle {
  let unloading = false;
  let cancelTimer: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const live = () => {
    cancelTimer?.();
    cancelTimer = null;
    if (!unloading) return;
    unloading = false;
    for (const listener of [...listeners]) listener();
  };
  const leaving = (settled: boolean) => {
    unloading = true;
    cancelTimer?.();
    cancelTimer = settled ? null : schedule(live, UNLOAD_CANCELLED_AFTER_MS);
  };
  target?.addEventListener("beforeunload", () => leaving(false));
  target?.addEventListener("pagehide", () => leaving(true));
  target?.addEventListener("pageshow", live);
  target?.addEventListener("visibilitychange", () => {
    if (target.isVisible()) live();
  });
  return {
    isUnloading: () => unloading,
    onLive: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

let shared: PageLifecycle | null = null;

// WHY: Page-wide singleton; the SDK is rebuilt per bearer rotation and fresh listeners would leak. ADR-0030
export function sharedPageLifecycle(): PageLifecycle {
  shared ??= createPageLifecycle();
  return shared;
}
