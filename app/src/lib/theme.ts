/**
 * The theme preference: the engine-facing half of theming.
 *
 * Three string preferences are the source of truth, read and written through
 * `tauriPreferences` with no migration: `theme` is the mode (`light`, `dark` or
 * `system`), `theme.light` and `theme.dark` name the palette each mode wears. An
 * unknown value, or a palette whose mode does not match the key it sits under,
 * falls back to that key's default and is reported: a preference we cannot read
 * is a bug we want to see, never a silent repaint.
 *
 * Every path that changes the theme goes through `applyThemePreference`, so the
 * DOM, the boot mirror (`./theme-boot`) and the native window chrome can never
 * drift from each other, and the OS-appearance watcher stays installed exactly
 * once.
 */

import { getCurrentWindow } from "@tauri-apps/api/window";
import { logAndReportError, reportError } from "./error-report";
import { tauriPreferences } from "./tauri";
import {
  applyThemeAttribute,
  startSystemThemeSync,
  systemPrefersDark,
  writeCachedTheme,
} from "./theme-boot";
import {
  DEFAULT_THEME_PREFERENCE,
  parsePaletteId,
  parseThemeMode,
  type ResolvedMode,
  type ResolvedTheme,
  resolveTheme,
  type ThemePreference,
} from "./theme-model";

/** The engine preference keys, one per field of a {@link ThemePreference}. */
const KEYS = {
  mode: "theme",
  light: "theme.light",
  dark: "theme.dark",
} as const;

/**
 * The last preference applied: what the OS-appearance watcher re-resolves and
 * what a partial update patches. It holds the documented defaults until the
 * engine read lands, which is also why the first `applyThemePreference` is what
 * installs the watcher: before that there is no preference to gate on.
 */
let current: ThemePreference = DEFAULT_THEME_PREFERENCE;
let watching = false;

/**
 * Match the native window chrome (the macOS title bar) to the app theme, so the
 * title bar tracks the app background instead of following the OS appearance.
 *
 * Best-effort and purely cosmetic: the CSS `data-theme` set by
 * {@link applyThemePreference} is what actually drives the UI; if this native
 * call fails the only consequence is the title bar not recolouring, which has
 * nothing actionable to surface. No-op on web (the window shim ignores it).
 */
function syncWindowChrome(mode: ResolvedMode): void {
  void getCurrentWindow()
    .setTheme(mode)
    .catch(() => {});
}

/**
 * Apply a preference everywhere it is observable: the `<html>` attributes, the
 * device-local mirror the next boot paints from, and the native window chrome.
 * Resolves against the LIVE OS appearance, so `system` lands on what the OS says
 * at this instant.
 */
export function applyThemePreference(pref: ThemePreference): ResolvedTheme {
  current = pref;
  const resolved = resolveTheme(pref, systemPrefersDark());
  applyThemeAttribute(resolved);
  writeCachedTheme(resolved);
  syncWindowChrome(resolved.mode);
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

/**
 * One key's stored value, or its default. A value that is present but unusable
 * is reported: it means something wrote a preference this build cannot read.
 */
function valueOrDefault<T>(
  key: string,
  raw: string | null,
  parsed: T | null,
  fallback: T,
): T {
  if (parsed !== null) return parsed;
  if (raw !== null) {
    reportError(
      "theme_preference_unusable",
      `preference "${key}" holds "${raw}", which is not a theme this build ships; using "${String(fallback)}"`,
    );
  }
  return fallback;
}

/**
 * Read the three preferences and apply them. Returns the preference in force,
 * or null when the READ failed (as opposed to "nothing saved"): applying a
 * default then would overwrite a correct device mirror with a guess and
 * mis-paint the next boot too, so the boot mirror keeps the screen instead.
 */
export async function loadThemePreference(): Promise<ThemePreference | null> {
  let stored: [string | null, string | null, string | null];
  try {
    stored = await Promise.all([
      tauriPreferences.get(KEYS.mode),
      tauriPreferences.get(KEYS.light),
      tauriPreferences.get(KEYS.dark),
    ]);
  } catch (err) {
    logAndReportError("load_theme_preference", err);
    return null;
  }
  const [mode, light, dark] = stored;
  const pref: ThemePreference = {
    mode: valueOrDefault(
      KEYS.mode,
      mode,
      parseThemeMode(mode),
      DEFAULT_THEME_PREFERENCE.mode,
    ),
    light: valueOrDefault(
      KEYS.light,
      light,
      parsePaletteId(light, "light"),
      DEFAULT_THEME_PREFERENCE.light,
    ),
    dark: valueOrDefault(
      KEYS.dark,
      dark,
      parsePaletteId(dark, "dark"),
      DEFAULT_THEME_PREFERENCE.dark,
    ),
  };
  applyThemePreference(pref);
  return pref;
}

/**
 * Change part of the preference: apply immediately, then persist ONLY the keys
 * that actually moved. Rejects if a write fails: the caller owns how that reads
 * to the user.
 */
export async function setThemePreference(
  patch: Partial<ThemePreference>,
): Promise<ThemePreference> {
  const previous = current;
  const next: ThemePreference = { ...previous, ...patch };
  applyThemePreference(next);
  const writes: Promise<void>[] = [];
  if (next.mode !== previous.mode) {
    writes.push(tauriPreferences.set(KEYS.mode, next.mode));
  }
  if (next.light !== previous.light) {
    writes.push(tauriPreferences.set(KEYS.light, next.light));
  }
  if (next.dark !== previous.dark) {
    writes.push(tauriPreferences.set(KEYS.dark, next.dark));
  }
  await Promise.all(writes);
  return next;
}
