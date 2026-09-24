/**
 * The theme preference: the engine-facing half of theming.
 *
 * The preference itself (the three keys, the vocabulary, validation and the
 * diff-only write) is the SDK's appearance module, reached through the engine
 * adapter in `./theme-facade`. It stays device-local there, in the same store this
 * app has always written, so the AI Manager can read and change the appearance
 * through the very same capability.
 *
 * What lives here is the SURFACE's half: applying what the engine answered,
 * reporting a stored value this build cannot use (a preference we cannot read is
 * a bug we want to see, never a silent repaint), and telling a surface that
 * mounted mid-read when the answer has landed.
 *
 * Painting and storing are separate calls on purpose. `applyThemePreference`
 * lives in `./theme-apply` (the DOM, the boot mirror and the native window in one
 * ordered step) and is re-exported here as the theming entry point, together with
 * `currentThemePreference` so a caller has one import for the pair.
 */

import type { ThemePreference } from "@houston/sdk/appearance";
import { logAndReportError, reportError } from "./error-report";
import { applyThemePreference, currentThemePreference } from "./theme-apply";
import { tauriTheme } from "./theme-facade";

export { applyThemePreference, currentThemePreference };

/** The boot read's answer once it has landed, absent while it is in flight. */
let booted: { pref: ThemePreference | null } | null = null;
let announce: ((pref: ThemePreference | null) => void) | null = null;
let waiting: Promise<ThemePreference | null> | null = null;

function settleBoot(pref: ThemePreference | null): void {
  booted = { pref };
  announce?.(pref);
}

/**
 * The preference the boot read found, awaited: the answer if it already landed,
 * otherwise the promise of it. `null` means the READ FAILED, so what is saved is
 * unknown; a surface that writes must stay closed rather than act on a guess,
 * because a write diffed against the defaults would persist a combination the
 * user never chose.
 *
 * A surface that mounts while the read is in flight needs this. The read starts
 * once, at boot, behind the engine handshake (`main.tsx`, `app-tree.tsx`), and
 * reaching the device's store is a round trip to the host: on a cold engine that
 * is long enough for someone to open Settings first.
 */
export function themeReady(): Promise<ThemePreference | null> {
  if (booted) return Promise.resolve(booted.pref);
  waiting ??= new Promise<ThemePreference | null>((resolve) => {
    announce = resolve;
  });
  return waiting;
}

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
    settleBoot(pref);
    return pref;
  } catch (err) {
    logAndReportError("load_theme_preference", err);
    settleBoot(null);
    return null;
  }
}

/**
 * Change part of the preference: persist ONLY the keys that moved and answer the
 * preference now stored. Rejects if a write fails, or if the patch names an
 * appearance this build cannot wear, and in either case the device still holds
 * `previous`, so the caller owns both the screen and how the refusal reads.
 *
 * It paints NOTHING. The caller paints, through `applyThemePreference`: a write
 * takes a round trip, and one that painted its own result would put a superseded
 * preference back on the page whenever a newer pick landed while it was in
 * flight. The Appearance row's committer is built on that split.
 *
 * `previous` is the preference already SAVED. A committer that paints per pick
 * and writes once the picks stop passes it, so the diff is taken against the
 * stored value rather than against the one already on screen, which is what makes
 * the last pick of a burst persist at all.
 */
export function persistThemePreference(
  patch: Partial<ThemePreference>,
  previous: ThemePreference,
): Promise<ThemePreference> {
  return tauriTheme.set(patch, previous);
}
