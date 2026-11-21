import type { BrowserLiveLayout } from "@houston/wire-types";
import type { Page } from "playwright-core";
import type { BrowserTab } from "../open-tab";

export const DESKTOP_VIEWPORT = { width: 1280, height: 800 } as const;
export const PHONE_VIEWPORT = { width: 412, height: 860 } as const;

const viewportOf = (layout: BrowserLiveLayout) =>
  layout === "phone" ? PHONE_VIEWPORT : DESKTOP_VIEWPORT;

export async function fitPage(tab: BrowserTab, page: Page): Promise<void> {
  if (page.isClosed()) return;
  const want = viewportOf(tab.layout);
  const has = page.viewportSize();
  if (has?.width === want.width && has.height === want.height) return;
  await page.setViewportSize(want);
}

export async function applyLayout(
  tab: BrowserTab,
  layout: BrowserLiveLayout,
): Promise<void> {
  tab.layout = layout;
  await fitPage(tab, tab.page);
}

export async function restoreLayout(tab: BrowserTab): Promise<void> {
  tab.layout = "desktop";
  const results = await Promise.allSettled(
    tab.context.pages().map((page) => fitPage(tab, page)),
  );
  for (const result of results)
    if (result.status === "rejected")
      console.warn("[browser] restoring a page's size failed", result.reason);
}
