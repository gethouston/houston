/**
 * The apply path: the ONE place a preference becomes what the user sees.
 *
 * Every path that changes the theme goes through {@link applyThemePreference},
 * so the DOM, the boot mirror (`./theme-boot`) and the native window chrome can
 * never drift from each other, and the OS-appearance watcher stays installed
 * exactly once. The preference itself is read and written in `./theme`, which
 * re-exports this function as the theming entry point.
 *
 * The native window is part of the contract, not decoration: the webview derives
 * `prefers-color-scheme` from the window's appearance, so the window must FOLLOW
 * the OS while the preference is `system` (`setTheme(null)`) and is pinned only
 * to a mode the user picked explicitly. A pinned window makes the media query
 * report the pinned mode instead of the OS one and stops the OS change event
 * arriving, which is why `system` resolves against the query only after the
 * release lands.
 */

import { getCurrentWindow } from "@tauri-apps/api/window";
import { logAndReportError } from "./error-report";
import {
  applyThemeAttribute,
  startSystemThemeSync,
  systemPrefersDark,
  systemPrefersDarkAfterRelease,
  writeCachedTheme,
} from "./theme-boot";
import {
  DEFAULT_THEME_PREFERENCE,
  followsSystem,
  type ResolvedMode,
  type ResolvedTheme,
  resolveTheme,
  type ThemePreference,
} from "./theme-model";

/**
 * The last preference applied: what the OS-appearance watcher re-resolves, what a
 * partial update patches, and what tells a late native answer that a newer
 * preference has taken over. It holds the documented defaults until the engine
 * read lands, which is also why the first `applyThemePreference` is what installs
 * the watcher: before that there is no preference to gate on.
 */
let current: ThemePreference = DEFAULT_THEME_PREFERENCE;
let watching = false;

/** The preference in force, for the patch `./theme` applies over it. */
export function currentThemePreference(): ThemePreference {
  return current;
}

/** Resolve against an OS answer and put the result everywhere it is observable. */
function paintTheme(
  pref: ThemePreference,
  prefersDark: boolean,
): ResolvedTheme {
  const resolved = resolveTheme(pref, prefersDark);
  applyThemeAttribute(resolved);
  writeCachedTheme(resolved);
  return resolved;
}

/**
 * Pin the native window chrome (the macOS title bar) to an explicitly picked
 * mode, so the title bar tracks the app background instead of the OS appearance.
 *
 * Best-effort and purely cosmetic: the CSS `data-theme` set by
 * {@link applyThemePreference} is what actually drives the UI; if this native
 * call fails the only consequence is the title bar not recolouring, which has
 * nothing actionable to surface. No-op on web (the window shim ignores it).
 */
function pinWindowChrome(mode: ResolvedMode): void {
  void getCurrentWindow()
    .setTheme(mode)
    .catch(() => {});
}

/**
 * Hand the native window back to the OS, then paint what the OS then reports.
 *
 * Unlike the pin, this failing is not cosmetic: the webview keeps answering the
 * mode pinned before, which leaves `system` wearing the last explicit pick, so
 * it reports. A preference applied while the release was in flight already owns
 * the DOM, and a late release never paints over it.
 */
async function followOsAppearance(pref: ThemePreference): Promise<void> {
  let prefersDark: boolean;
  try {
    prefersDark = await systemPrefersDarkAfterRelease(() =>
      getCurrentWindow().setTheme(null),
    );
  } catch (err) {
    logAndReportError("release_window_theme", err);
    return;
  }
  if (current === pref) paintTheme(pref, prefersDark);
}

/**
 * Apply a preference everywhere it is observable: the `<html>` attributes, the
 * device-local mirror the next boot paints from, and the native window chrome.
 *
 * Returns the theme painted NOW, resolved against the OS appearance the webview
 * reports at this instant. Under `system` that report is trustworthy only once
 * the window follows the OS, so the release paints again the moment it lands.
 */
export function applyThemePreference(pref: ThemePreference): ResolvedTheme {
  current = pref;
  const resolved = paintTheme(pref, systemPrefersDark());
  if (followsSystem(pref)) {
    void followOsAppearance(pref);
  } else {
    pinWindowChrome(resolved.mode);
  }
  if (!watching) {
    watching = true;
    startSystemThemeSync(
      () => current,
      (live) => {
        applyThemePreference(live);
      },
    );
  }
  return resolved;
}
