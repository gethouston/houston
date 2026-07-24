/**
 * Shared helpers for the visual-regression suite.
 *
 * The visual specs reuse the same boot seed + per-test host reset as the
 * functional suite (`../support/fixtures`), so every baseline is captured
 * against the fake host's deterministic seed. The only extra knob these specs
 * need is the app THEME.
 *
 * How theme is pinned here — and why it is NOT the `houston.pref.theme`
 * preference: the desktop entry (app/src/main.tsx) loads that pref after the
 * engine handshake (`StartupEffects` → `loadTheme` → `applyTheme`), but the WEB
 * entry mounts `NewEngineRoot` (packages/web/src/main.tsx) and its app-tree
 * deliberately does NOT run that bootstrap (App.tsx even notes theme load lives
 * in main.tsx's StartupEffects, not the tree). So under this harness the pref
 * is inert and nothing ever touches `data-theme`. The switch the UI actually
 * reads is `data-theme` on `<html>`: the `@theme inline` token bridge in
 * ui/core/src/globals.css re-resolves every color utility from it, live, on the
 * consuming element (see theme-pin.spec.ts). We therefore pin it directly —
 * AFTER navigation (an `addInitScript` at document-start races the parser
 * creating `<html>`), the same way theme-pin.spec.ts flips it via
 * `page.evaluate`. Because the whole app is CSS-token-driven (no JS theme state
 * in the web build), toggling the attribute re-themes the entire tree, and
 * `toHaveScreenshot`'s stability wait absorbs the re-resolve before the shot.
 */
import type { Page } from "@playwright/test";

export type Theme = "light" | "dark";

/**
 * Pin the app theme by setting `data-theme` on `<html>` (mirrors
 * app/src/lib/theme.ts `applyTheme`: dark → set, light → remove). Call after
 * `page.goto` and once the shell is visible, before the screenshot.
 */
export async function pinTheme(page: Page, theme: Theme): Promise<void> {
  await page.evaluate((t: Theme) => {
    const el = document.documentElement;
    if (t === "dark") el.setAttribute("data-theme", "dark");
    else el.removeAttribute("data-theme");
  }, theme);
}

/** Both themes, for `for (const theme of THEMES)` parametrized specs. */
export const THEMES: readonly Theme[] = ["light", "dark"] as const;
