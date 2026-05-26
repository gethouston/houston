/**
 * Lightweight client-side OS detection.
 *
 * Houston doesn't bundle `@tauri-apps/plugin-os`, and the webview's
 * `navigator` is enough to tell macOS apart from Linux/Windows — which is all
 * the frontend needs (e.g. ⌘ vs Ctrl shortcut hints, and routing native
 * notifications through the JS plugin on macOS vs. the Rust command on
 * Linux/Windows). Anything finer-grained belongs in Rust behind `#[cfg]`.
 */
/**
 * Pure macOS check over raw `navigator` fields, exported for tests. Prefers
 * `platform` and falls back to `userAgent` (some webviews leave `platform`
 * empty). The runtime `isMac` const below is the only production caller.
 */
export function isMacPlatform(
  platform: string | undefined | null,
  userAgent: string | undefined | null,
): boolean {
  return /mac/i.test(platform || userAgent || "");
}

export const isMac =
  typeof navigator !== "undefined" &&
  isMacPlatform(navigator.platform, navigator.userAgent);
