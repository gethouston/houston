/**
 * Boot-time theme mirror — applies the user's theme on the FIRST paint.
 *
 * The engine preference `theme` is the source of truth, but it reads through
 * `tauriPreferences -> getEngine()`, which only answers after the engine
 * handshake. The boot splash renders DURING that handshake and is themed
 * (`bg-background`), so without a device-local mirror a dark-mode user stares
 * at the light surface for the whole handshake (seconds on a cold start) and
 * then snaps to dark.
 *
 * So the resolved theme is mirrored to localStorage every time it is applied,
 * and re-applied synchronously before React mounts. Same contract as the locale
 * flash-cache in `./i18n`: a cache to avoid a flash, never the source of truth
 * — the engine value still lands moments later and wins.
 *
 * DOM + localStorage only (no Tauri, no engine imports), so it is safe to
 * evaluate before the app module graph boots and stays unit-testable.
 */

import { color } from "@houston/design-tokens";

export type Theme = "light" | "dark";

/**
 * Boot-time cache key in localStorage. Used ONLY to avoid a flash of the wrong
 * theme before the engine preference loads. Never the source of truth.
 */
const THEME_CACHE_KEY = "houston.theme.cache";

/**
 * Set the `data-theme` attribute every themed token keys off. Dark is the only
 * attribute value: light is the document default, so it is expressed by the
 * attribute being absent (subtrees still pin themselves with `data-theme`).
 *
 * Also re-points the `theme-color` meta (the browser/OS chrome colour — mobile
 * URL bar, PWA title bar) at the same surface the theme paints behind the app
 * (the body background in globals.css): light `input` #fcfcfc, dark `base`
 * #141416 — the exact pair the pre-paint frame in index.html hardcodes. The
 * meta ships in index.html, so it is only ever updated here, never created.
 */
export function applyThemeAttribute(theme: Theme): void {
  const el = document.documentElement;
  if (theme === "dark") {
    el.setAttribute("data-theme", "dark");
  } else {
    el.removeAttribute("data-theme");
  }
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute(
      "content",
      theme === "dark" ? color.dark.base : color.light.input,
    );
}

/**
 * The mirrored theme, or null when there is none yet.
 *
 * Storage being unavailable (disabled, or a hardened webview) is not a failed
 * user action — it means "no mirror", which is exactly what a first launch also
 * means. Both resolve to the pre-boot default and are corrected by the engine
 * preference a moment later, so there is nothing to surface.
 */
export function readCachedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(THEME_CACHE_KEY);
    return v === "dark" || v === "light" ? v : null;
  } catch {
    return null;
  }
}

/** Mirror the resolved theme for the next boot. Best-effort, see above. */
export function writeCachedTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_CACHE_KEY, theme);
  } catch {
    /* ignore quota / disabled storage — the mirror is optional by design */
  }
}

/**
 * Pre-boot step: apply the mirrored theme synchronously, before the first
 * render. Call from the entry module at module scope. Returns the theme it
 * applied, or null when there was no mirror to apply (first launch on this
 * device, or storage unavailable) — the document then keeps the light default,
 * exactly as it did before this mirror existed.
 */
export function applyBootTheme(): Theme | null {
  const cached = readCachedTheme();
  if (cached) applyThemeAttribute(cached);
  return cached;
}
