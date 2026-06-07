/**
 * Web shim for `@tauri-apps/api/window` (`getCurrentWindow`).
 *
 * app/src uses three window methods:
 *  - `close()`        — DisclaimerGate "Decline" (use-legal-acceptance.ts)
 *  - `isFocused()`    — notification nav arming (session-notifications.ts)
 *  - `onFocusChanged` — notification click-to-navigate (macOS focus proxy)
 *
 * Browser equivalents: window.close() (only effective for script-opened tabs,
 * a benign no-op otherwise), document.hasFocus(), and window focus/blur events.
 */

type UnlistenFn = () => void;

interface FocusEvent {
  payload: boolean;
}

interface WebWindow {
  close(): Promise<void>;
  isFocused(): Promise<boolean>;
  onFocusChanged(handler: (event: FocusEvent) => void): Promise<UnlistenFn>;
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
  };
}
