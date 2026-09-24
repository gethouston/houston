/**
 * The theme preference: the engine-facing half of theming.
 *
 * The preference itself — the three keys, the vocabulary, validation and the
 * diff-only write — is the SDK's appearance module, reached through the engine
 * adapter (`getThemePreference` / `setThemePreference`). It stays device-local
 * there, in the same store this app has always written, so the AI Manager can
 * read and change the appearance through the very same capability.
 *
 * What lives here is the SURFACE's half: applying what the engine answered, and
 * reporting a stored value this build cannot use — a preference we cannot read is
 * a bug we want to see, never a silent repaint.
 *
 * Every path that changes the theme goes through `applyThemePreference`, which
 * lives in `./theme-apply` (the DOM, the boot mirror and the native window in one
 * ordered step) and is re-exported here as the theming entry point, together with
 * `currentThemePreference` so a caller has one import for the pair.
 */

import type { ThemePreference } from "@houston/sdk/appearance";
import { logAndReportError, reportError } from "./error-report";
import { tauriTheme } from "./tauri";
import { applyThemePreference, currentThemePreference } from "./theme-apply";

export { applyThemePreference, currentThemePreference };

/**
 * Read the preference and apply it. Returns the preference in force, or null when
 * the READ failed (as opposed to "nothing saved"): applying a default then would
 * overwrite a correct device mirror with a guess and mis-paint the next boot too,
 * so the boot mirror keeps the screen instead.
 */
export async function loadThemePreference(): Promise<ThemePreference | null> {
  try {
    const { pref, unusable } = await tauriTheme.get();
    for (const { key, raw } of unusable) {
      reportError(
        "theme_preference_unusable",
        `preference "${key}" holds "${raw}", which is not a theme this build ships`,
      );
    }
    applyThemePreference(pref);
    return pref;
  } catch (err) {
    logAndReportError("load_theme_preference", err);
    return null;
  }
}

/**
 * Change part of the preference: persist ONLY the keys that moved, then apply the
 * result. Rejects if a write fails, or if the patch names an appearance this build
 * cannot wear — and in either case nothing is painted, so a refused change leaves
 * the screen honest and the caller owns how it reads to the user.
 *
 * `previous` is the preference already SAVED. A committer that paints per pick and
 * writes once the picks stop passes it, so the diff is taken against the stored
 * value rather than against the one already on screen — which is what makes the
 * last pick of a burst persist at all. Left out, it is the preference in force,
 * which is the same thing for a caller that has painted nothing.
 */
export async function setThemePreference(
  patch: Partial<ThemePreference>,
  previous: ThemePreference = currentThemePreference(),
): Promise<ThemePreference> {
  const next = await tauriTheme.set(patch, previous);
  applyThemePreference(next);
  return next;
}
