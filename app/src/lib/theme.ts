import type { ThemePreference } from "@houston/sdk/appearance";
import { logAndReportError, reportError } from "./error-report";
import { applyThemePreference, currentThemePreference } from "./theme-apply";
import { tauriTheme } from "./theme-facade";

export { applyThemePreference, currentThemePreference };

let booted: { pref: ThemePreference | null } | null = null;
let announce: ((pref: ThemePreference | null) => void) | null = null;
let waiting: Promise<ThemePreference | null> | null = null;

function settleBoot(pref: ThemePreference | null): void {
  booted = { pref };
  announce?.(pref);
}

export function themeReady(): Promise<ThemePreference | null> {
  if (booted) return Promise.resolve(booted.pref);
  waiting ??= new Promise<ThemePreference | null>((resolve) => {
    announce = resolve;
  });
  return waiting;
}

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

export function persistThemePreference(
  patch: Partial<ThemePreference>,
  previous: ThemePreference,
): Promise<ThemePreference> {
  return tauriTheme.set(patch, previous);
}
