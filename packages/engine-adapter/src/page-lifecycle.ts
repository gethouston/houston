import type { PageLifecycle } from "@houston/sdk";

/** The events that drive the flag, on whatever stands in for the page. */
export interface PageLifecycleTarget {
  addEventListener(
    type: "beforeunload" | "pagehide" | "pageshow" | "visibilitychange",
    handler: () => void,
  ): void;
  /** Whether the document is on screen right now (`visibilityState`). */
  isVisible(): boolean;
}

/** How long a `beforeunload` counts as "leaving" when no `pagehide` follows.
 *  A declined prompt, a download or a `mailto:` link cancels the navigation
 *  and the page stays. The gap between `beforeunload` and `pagehide` on a
 *  real navigation is the NEXT page's network time, so a slow reload can
 *  outlast this and `live` then fires on a page that is leaving after all;
 *  the SDK's hold tolerates that (a resend with no answer stays held and
 *  tries again on its own timer), so this only has to be right most of the
 *  time, not always. */
export const UNLOAD_CANCELLED_AFTER_MS = 2_000;

/** The real page, when there is one: `window` for the events (the document's
 *  `visibilitychange` bubbles to it), `document` for the visibility. A unit
 *  test's bare `window` stub has no event surface and counts as no page. */
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

/**
 * The SDK's {@link PageLifecycle} port over the real page.
 *
 * `beforeunload` marks the document as leaving as soon as a navigation
 * STARTS: Firefox cancels the document's fetches then, before `pagehide`,
 * which fires at commit (Chromium and WebKit abort them after `pagehide`, so
 * either event is early enough there). `pagehide` marks it too, for the
 * browsers that raise no `beforeunload` for a tab going to the background
 * (iOS). The page is live again, and `onLive` listeners run, on `pageshow`
 * (a back/forward-cache restore of the same document), on a
 * `visibilitychange` back to visible (iOS raised `pagehide` for the
 * background and may raise no `pageshow` on the way back), and when a
 * `beforeunload` saw no `pagehide` within {@link UNLOAD_CANCELLED_AFTER_MS}:
 * the navigation was cancelled and the page lives on. A page that never
 * looked like leaving never reports live. No page at all (SSR, tests): never
 * unloading, never live.
 */
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
    for (const listener of Array.from(listeners)) listener();
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

/**
 * The one lifecycle every SDK instance shares. `createEngineSdk` runs on every
 * bearer rotation and per space, and a fresh set of window listeners each time
 * would never be removed.
 */
export function sharedPageLifecycle(): PageLifecycle {
  shared ??= createPageLifecycle();
  return shared;
}
