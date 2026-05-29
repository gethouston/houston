/**
 * Lightweight client-side OS detection.
 *
 * Houston doesn't bundle `@tauri-apps/plugin-os`, and the webview's
 * `navigator` is enough for coarse OS detection: shortcut hints,
 * notification routing, and analytics OS breakdowns. Anything finer-grained
 * belongs in Rust behind `#[cfg]`.
 */
export type PlatformOs = "macos" | "windows" | "linux" | "unknown";

/**
 * Pure OS classifier over raw `navigator` fields, exported for tests. Prefers
 * `platform` and falls back to `userAgent` (some webviews leave `platform`
 * empty) so a spoofed/fallback UA cannot override a concrete platform value.
 */
export function detectPlatformOs(
  platform: string | undefined | null,
  userAgent: string | undefined | null,
): PlatformOs {
  const source = (platform?.trim() || userAgent?.trim() || "").toLowerCase();
  if (/mac|darwin/.test(source)) return "macos";
  if (/win/.test(source)) return "windows";
  if (/linux|x11/.test(source)) return "linux";
  return "unknown";
}

/** Pure macOS check over raw `navigator` fields, exported for tests. */
export function isMacPlatform(
  platform: string | undefined | null,
  userAgent: string | undefined | null,
): boolean {
  return detectPlatformOs(platform, userAgent) === "macos";
}

export const currentPlatformOs: PlatformOs =
  typeof navigator !== "undefined"
    ? detectPlatformOs(navigator.platform, navigator.userAgent)
    : "unknown";

export const isMac = currentPlatformOs === "macos";
