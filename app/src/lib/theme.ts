import { getCurrentWindow } from "@tauri-apps/api/window";
import { tauriPreferences } from "./tauri";

export type Theme = "light" | "dark";

const THEME_KEY = "theme";

export function applyTheme(theme: Theme) {
  const el = document.documentElement;
  if (theme === "dark") {
    el.setAttribute("data-theme", "dark");
  } else {
    el.removeAttribute("data-theme");
  }

  // Match the native window chrome (the macOS title bar) to the app theme so
  // the title bar tracks the background instead of following the OS appearance.
  // Best-effort + cosmetic — the in-app theme is already applied above and a
  // failure has nothing actionable to surface (mirrors the preference read
  // below; no-op on web).
  void getCurrentWindow()
    .setTheme(theme)
    .catch(() => {});
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
