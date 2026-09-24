/**
 * Web shim for `@tauri-apps/api/window` (`getCurrentWindow`).
 *
 * app/src uses these window methods:
 *  - `close()`        — DisclaimerGate "Decline" (use-legal-acceptance.ts)
 *  - `isFullscreen()` — native window controls inset (use-window-controls-inset.ts)
 *  - `onResized`      — refresh the window controls inset on fullscreen changes
 *  - `isFocused()`    — notification nav arming (session-notifications.ts)
 *  - `onFocusChanged` — notification click-to-navigate (macOS focus proxy)
 *  - `setTheme()`     — pin the native title bar to the app theme, or hand the
 *                       window back to the OS with `null` (theme-apply.ts)
 *
 * Browser equivalents: window.close() (only effective for script-opened tabs,
 * a benign no-op otherwise), document.hasFocus(), document.fullscreenElement,
 * and window events. A browser tab has no window chrome to theme, so setTheme
 * is a no-op: the CSS data-theme on <html> already drives the UI, and a
 * browser's prefers-color-scheme follows the OS with nothing to release.
 */

type UnlistenFn = () => void;

interface FocusEvent {
  payload: boolean;
}

interface WebWindow {
  close(): Promise<void>;
  isFocused(): Promise<boolean>;
  isFullscreen(): Promise<boolean>;
  onResized(handler: () => void): Promise<UnlistenFn>;
  onFocusChanged(handler: (event: FocusEvent) => void): Promise<UnlistenFn>;
  setTheme(theme?: "light" | "dark" | null): Promise<void>;
}

export function getCurrentWindow(): WebWindow {
  return {
    async close(): Promise<void> {
      // Closes only tabs opened via window.open; harmless no-op for a
      // top-level tab. (DisclaimerGate's Decline is the only caller.)
      window.close();
    },
    async isFocused(): Promise<boolean> {
      return typeof document !== "undefined" ? document.hasFocus() : true;
    },
    async isFullscreen(): Promise<boolean> {
      return document.fullscreenElement !== null;
    },
    onResized(handler: () => void): Promise<UnlistenFn> {
      window.addEventListener("resize", handler);
      return Promise.resolve(() =>
        window.removeEventListener("resize", handler),
      );
    },
    onFocusChanged(handler: (event: FocusEvent) => void): Promise<UnlistenFn> {
      const onFocus = () => handler({ payload: true });
      const onBlur = () => handler({ payload: false });
      window.addEventListener("focus", onFocus);
      window.addEventListener("blur", onBlur);
      return Promise.resolve(() => {
        window.removeEventListener("focus", onFocus);
        window.removeEventListener("blur", onBlur);
      });
    },
    async setTheme(): Promise<void> {
      // No window chrome to theme in a browser tab.
    },
  };
}
