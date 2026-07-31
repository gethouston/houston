import { getCurrentWindow } from "@tauri-apps/api/window";
import { tauriPreferences } from "./tauri";
import {
  applyThemeAttribute,
  type Theme,
  writeCachedTheme,
} from "./theme-boot";

export type { Theme };

/** Engine preference key for the user's chosen theme — the source of truth. */
const THEME_KEY = "theme";

/**
 * Match the native window chrome (the macOS title bar) to the app theme, so the
 * title bar tracks the app background instead of following the OS appearance.
 *
 * Best-effort and purely cosmetic: the CSS `data-theme` set by {@link applyTheme}
 * is what actually drives the UI; if this native call fails the only consequence
 * is the title bar not recolouring, which has nothing actionable to surface. No-op
 * on web (the window shim ignores it). The swallow mirrors the same pattern used
 * for theme persistence reads elsewhere in this layer.
 */
function syncWindowChrome(theme: Theme): void {
  void getCurrentWindow()
    .setTheme(theme)
    .catch(() => {});
}

/**
 * Apply a theme everywhere it is observable: the CSS `data-theme` attribute,
 * the device-local mirror the next boot paints from (see `./theme-boot`), and
 * the native window chrome. Every path that changes the theme goes through
 * here, so the mirror can never drift from what the user sees.
 */
export function applyTheme(theme: Theme) {
  applyThemeAttribute(theme);
  writeCachedTheme(theme);
  syncWindowChrome(theme);
}

export async function loadTheme(): Promise<Theme | null> {
  let saved: string | null;
  try {
    saved = await tauriPreferences.get(THEME_KEY);
  } catch {
    // Read FAILED (as opposed to "no preference saved"): keep whatever the
    // boot mirror painted. Applying the light fallback here would overwrite a
    // correct device mirror with a guess and mis-paint the next boot too.
    return null;
  }
  const theme: Theme = saved === "dark" ? "dark" : "light";
  applyTheme(theme);
  return theme;
}

export async function setTheme(theme: Theme) {
  applyTheme(theme);
  await tauriPreferences.set(THEME_KEY, theme);
}
