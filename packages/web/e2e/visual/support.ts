import type { Page } from "@playwright/test";

export type Theme = "light" | "dark";

export async function pinTheme(page: Page, theme: Theme): Promise<void> {
  await page.evaluate((t: Theme) => {
    const el = document.documentElement;
    if (t === "dark") el.setAttribute("data-theme", "dark");
    else el.removeAttribute("data-theme");
    el.setAttribute("data-palette", `houston-${t}`);
    el.style.background = "var(--ht-base)";
    localStorage.setItem("houston.pref.theme", t);
    localStorage.setItem("houston.theme.cache", t);
  }, theme);
}

export const THEMES: readonly Theme[] = ["light", "dark"] as const;
