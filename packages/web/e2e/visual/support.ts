/**
 * Shared helpers for the visual-regression suite.
 *
 * The visual specs reuse the same boot seed + per-test host reset as the
 * functional suite (`../support/fixtures`), so every baseline is captured
 * against the fake host's deterministic seed. The only extra knob these specs
 * need is the app THEME.
 *
 * How theme is pinned here — and why it is NOT the `houston.pref.theme`
 * preference: both entries do load that pref (desktop `StartupEffects`, web
 * `useEngineTheme` in app-tree.tsx) — but only ONCE, right after the engine
 * handshake, which lands long before a spec is ready to shoot. Driving a
 * baseline through the pref would mean seeding it before boot and re-navigating
 * per theme; the pin below is a live switch instead. It runs after the shell is
 * visible, i.e. after that one-shot load, so it always wins. The switch the UI
 * actually reads is `data-theme` on `<html>`: the `@theme inline` token bridge in
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
    // Also align the device-local preference + boot mirror: on web the theme
    // pref resolves device-locally, so if the one-shot `loadTheme()` lands
    // AFTER this pin (slow load), it re-applies the SAME theme instead of
    // silently flipping the baseline back.
    localStorage.setItem("houston.pref.theme", t);
    localStorage.setItem("houston.theme.cache", t);
  }, theme);
}

/** Both themes, for `for (const theme of THEMES)` parametrized specs. */
export const THEMES: readonly Theme[] = ["light", "dark"] as const;
