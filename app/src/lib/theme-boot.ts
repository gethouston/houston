import {
  followsSystem,
  paletteSwatch,
  type ResolvedTheme,
  type ThemePreference,
} from "@houston/sdk/appearance";
import { parseThemeMirror, serializeThemeMirror } from "./theme-model";

const THEME_CACHE_KEY = "houston.theme.cache";

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function applyThemeAttribute(resolved: ResolvedTheme): void {
  const el = document.documentElement;
  if (resolved.mode === "dark") {
    el.setAttribute("data-theme", "dark");
  } else {
    el.removeAttribute("data-theme");
  }
  el.setAttribute("data-palette", resolved.palette);
  const swatch = paletteSwatch(resolved.palette);
  el.style.background = swatch.base;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute(
      "content",
      resolved.mode === "dark" ? swatch.base : swatch.background,
    );
}

export function readCachedTheme(): ResolvedTheme | null {
  try {
    return parseThemeMirror(localStorage.getItem(THEME_CACHE_KEY));
  } catch {
    return null;
  }
}

export function writeCachedTheme(resolved: ResolvedTheme): void {
  try {
    localStorage.setItem(THEME_CACHE_KEY, serializeThemeMirror(resolved));
  } catch {}
}

export function applyBootTheme(): ResolvedTheme | null {
  const cached = readCachedTheme();
  if (cached) applyThemeAttribute(cached);
  return cached;
}

export function systemPrefersDark(): boolean {
  if (typeof globalThis.matchMedia !== "function") return false;
  return globalThis.matchMedia(DARK_QUERY).matches;
}

export async function systemPrefersDarkAfterRelease(
  releaseWindow: () => Promise<void>,
): Promise<boolean> {
  await releaseWindow();
  return systemPrefersDark();
}

export function watchSystemTheme(
  onChange: (prefersDark: boolean) => void,
): () => void {
  if (typeof globalThis.matchMedia !== "function") return () => {};
  const query = globalThis.matchMedia(DARK_QUERY);
  const handler = (event: MediaQueryListEvent) => onChange(event.matches);
  query.addEventListener("change", handler);
  return () => query.removeEventListener("change", handler);
}

export function startSystemThemeSync(
  currentPreference: () => ThemePreference,
  reapply: (pref: ThemePreference) => void,
): () => void {
  return watchSystemTheme(() => {
    const pref = currentPreference();
    if (followsSystem(pref)) reapply(pref);
  });
}
