/**
 * Lightweight client-side OS detection.
 *
 * Houston doesn't bundle `@tauri-apps/plugin-os`, and the webview's
 * `navigator` is enough to tell macOS apart from Linux/Windows — which is all
 * the frontend needs (e.g. ⌘ vs Ctrl shortcut hints, and routing native
 * notifications through the JS plugin on macOS vs. the Rust command on
 * Linux/Windows). Anything finer-grained belongs in Rust behind `#[cfg]`.
 */
export const isMac =
  typeof navigator !== "undefined" &&
  /mac/i.test(navigator.platform || navigator.userAgent || "");
