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
 * Every path that changes the theme goes through `applyThemePreference`, which
 * lives in `./theme-apply` (the DOM, the boot mirror and the native window in one
 * ordered step) and is re-exported here as the theming entry point.
 */

import { logAndReportError, reportError } from "./error-report";
import { tauriPreferences } from "./tauri";
import { applyThemePreference, currentThemePreference } from "./theme-apply";
import {
  DEFAULT_THEME_PREFERENCE,
  parsePaletteId,
  parseThemeMode,
  type ThemePreference,
} from "./theme-model";

export { applyThemePreference };

/** The engine preference keys, one per field of a {@link ThemePreference}. */
const KEYS = {
  mode: "theme",
  light: "theme.light",
  dark: "theme.dark",
} as const;

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
  const previous = currentThemePreference();
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
