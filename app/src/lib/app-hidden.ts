// "The window is going away" — the only notice work that must be durable
// before the app ends will ever get.
//
// React runs no cleanup when a window closes, so an effect's teardown is NOT a
// shutdown hook: a subscription mounted at a root that never unmounts is torn
// down by the process exiting, not by React, and anything it was holding dies
// with it. The page's own lifecycle is what actually fires. Tauri's WKWebView
// delivers `pagehide` reliably on app close (the same pair `App.tsx` uses for
// its `session_ended` signal), and `visibilitychange` covers the goodbyes that
// never produce one: a cmd-tab away, a minimize, a backgrounded browser tab.
//
// The page is injected so the rule is driven by tests without a browser.

export interface AppHiddenSource {
  on(type: "pagehide" | "visibilitychange", handler: () => void): void;
  off(type: "pagehide" | "visibilitychange", handler: () => void): void;
  /** Whether the window is off screen RIGHT NOW. */
  isHidden(): boolean;
}

/** The real page. `pagehide` is a window event; `visibilitychange` is the
 *  document's, read against the document's own state. */
export function browserHiddenSource(): AppHiddenSource {
  return {
    on: (type, handler) =>
      type === "pagehide"
        ? window.addEventListener(type, handler)
        : document.addEventListener(type, handler),
    off: (type, handler) =>
      type === "pagehide"
        ? window.removeEventListener(type, handler)
        : document.removeEventListener(type, handler),
    isHidden: () => document.visibilityState === "hidden",
  };
}

/**
 * Calls `onHidden` every time the window goes away — closing, or merely off
 * screen. Both, because neither alone is enough: a quit may never raise
 * `visibilitychange`, and a tab the browser discards may never raise
 * `pagehide`. Handlers must therefore be safe to run more than once; the
 * second call on the same goodbye is expected, not a bug.
 *
 * Returns the way to stop listening.
 */
export function onAppHidden(
  onHidden: () => void,
  source: AppHiddenSource = browserHiddenSource(),
): () => void {
  const onPageHide = () => onHidden();
  const onVisibility = () => {
    // Both directions raise the same event; only one of them is a goodbye.
    if (source.isHidden()) onHidden();
  };
  source.on("pagehide", onPageHide);
  source.on("visibilitychange", onVisibility);
  return () => {
    source.off("pagehide", onPageHide);
    source.off("visibilitychange", onVisibility);
  };
}
