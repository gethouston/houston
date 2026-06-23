import { getCurrentWindow } from "@tauri-apps/api/window";
import { tauriPreferences } from "./tauri";

export type Theme = "light" | "dark";

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

export function applyTheme(theme: Theme) {
  const el = document.documentElement;
  if (theme === "dark") {
    el.setAttribute("data-theme", "dark");
  } else {
    el.removeAttribute("data-theme");
  }
  syncWindowChrome(theme);
}

export async function loadTheme(): Promise<Theme> {
  const saved = await tauriPreferences.get(THEME_KEY).catch(() => null);
  const theme: Theme = saved === "dark" ? "dark" : "light";
  applyTheme(theme);
  return theme;
}

export async function setTheme(theme: Theme) {
  applyTheme(theme);
  await tauriPreferences.set(THEME_KEY, theme);
}
