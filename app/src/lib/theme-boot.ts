/**
 * The DOM side of theming: the one place a theme is painted, and the boot mirror
 * that paints it on the FIRST frame.
 *
 * The engine preferences (`theme`, `theme.light`, `theme.dark`, see `./theme`)
 * are the source of truth, but they read through `tauriPreferences ->
 * getEngine()`, which only answers after the engine handshake. The boot splash
 * renders DURING that handshake and is themed (`bg-background`), so without a
 * device-local mirror a dark-mode user stares at the light surface for the whole
 * handshake (seconds on a cold start) and then snaps to dark.
 *
 * So every apply mirrors the RESOLVED theme to localStorage as JSON (mode,
 * palette, and the two hexes the first frame needs), the pre-paint script in
 * both index.html files paints from it, and `applyBootTheme()` re-applies it
 * synchronously before React mounts. Same contract as the locale flash-cache in
 * `./i18n`: a cache to avoid a flash, never the source of truth; the engine
 * value lands moments later and wins.
 *
 * DOM + localStorage only (no Tauri, no engine imports), so it is safe to
 * evaluate before the app module graph boots and stays unit-testable.
 */

import {
  followsSystem,
  paletteSwatch,
  type ResolvedTheme,
  type ThemePreference,
} from "@houston/sdk/appearance";
import { parseThemeMirror, serializeThemeMirror } from "./theme-model";

/**
 * Boot-time cache key in localStorage. Used ONLY to avoid a flash of the wrong
 * theme before the engine preferences load. Never the source of truth.
 */
const THEME_CACHE_KEY = "houston.theme.cache";

/** The OS appearance query, spelled once: both readers below must agree. */
const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Put the resolved theme on `<html>`, where everything visual keys off it:
 *
 *  - `data-theme="dark"` for dark. Light is the document default, so it is
 *    expressed by the attribute being ABSENT (subtrees still pin themselves
 *    with their own `data-theme`).
 *  - `data-palette="<id>"`, always and for Houston's ids too: the palette CSS
 *    blocks key off it, and a picker reads the live value back off the DOM.
 *  - the inline `background`, which MUST track the palette: the pre-paint script
 *    sets it so a palette's first frame is its own gutter, and an inline style
 *    outranks canvas.css's `html { background-color: var(--ht-base) }`, so
 *    leaving it behind would freeze the gutter on the palette that booted.
 *  - the `theme-color` meta (the browser/OS chrome colour: mobile URL bar, PWA
 *    title bar): the gutter in dark, the screen in light, matching the surface
 *    the frame actually shows. The meta ships in index.html, so it is only ever
 *    updated here, never created.
 */
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

/**
 * The mirrored theme, or null when there is none yet.
 *
 * Storage being unavailable (disabled, or a hardened webview) is not a failed
 * user action — it means "no mirror", which is exactly what a first launch also
 * means. Both resolve to the pre-boot default and are corrected by the engine
 * preferences a moment later, so there is nothing to surface.
 */
export function readCachedTheme(): ResolvedTheme | null {
  try {
    return parseThemeMirror(localStorage.getItem(THEME_CACHE_KEY));
  } catch {
    return null;
  }
}

/** Mirror the resolved theme for the next boot. Best-effort, see above. */
export function writeCachedTheme(resolved: ResolvedTheme): void {
  try {
    localStorage.setItem(THEME_CACHE_KEY, serializeThemeMirror(resolved));
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
export function applyBootTheme(): ResolvedTheme | null {
  const cached = readCachedTheme();
  if (cached) applyThemeAttribute(cached);
  return cached;
}

/**
 * Whether the OS asks for dark right now. False where `matchMedia` does not
 * exist (a non-browser host, e.g. a unit test), which reads as "the OS has no
 * opinion" and lands on the light default.
 */
export function systemPrefersDark(): boolean {
  if (typeof globalThis.matchMedia !== "function") return false;
  return globalThis.matchMedia(DARK_QUERY).matches;
}

/**
 * The OS appearance for a preference that follows the system, read only once the
 * native window has been handed back to the OS.
 *
 * The webview derives `prefers-color-scheme` from the native window, so while
 * the window is pinned to a mode the query answers THAT mode and the OS change
 * event never arrives: releasing the window is part of resolving `system`, not
 * chrome, and the read has to wait for it. A release that fails rejects here
 * too, because the value after it would be the pinned one. The window itself is
 * the caller's to reach (`./theme-apply`), which is what keeps this module free
 * of Tauri.
 */
export async function systemPrefersDarkAfterRelease(
  releaseWindow: () => Promise<void>,
): Promise<boolean> {
  await releaseWindow();
  return systemPrefersDark();
}

/**
 * Watch the OS appearance. Returns an unsubscribe; a host without `matchMedia`
 * never fires, so the unsubscribe is a no-op there.
 */
export function watchSystemTheme(
  onChange: (prefersDark: boolean) => void,
): () => void {
  if (typeof globalThis.matchMedia !== "function") return () => {};
  const query = globalThis.matchMedia(DARK_QUERY);
  const handler = (event: MediaQueryListEvent) => onChange(event.matches);
  query.addEventListener("change", handler);
  return () => query.removeEventListener("change", handler);
}

/**
 * Keep the app in step with the OS appearance while the preference follows it.
 *
 * Subscribed once, for the process: the subscription is cheap and permanent, and
 * the GATE is the preference, read fresh on every event. An explicit light or
 * dark choice must not move when the OS flips, so `reapply` runs only while the
 * preference is `system`.
 */
export function startSystemThemeSync(
  currentPreference: () => ThemePreference,
  reapply: (pref: ThemePreference) => void,
): () => void {
  return watchSystemTheme(() => {
    const pref = currentPreference();
    if (followsSystem(pref)) reapply(pref);
  });
}
