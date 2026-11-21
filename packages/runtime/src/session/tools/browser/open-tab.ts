import type { BrowserLiveLayout } from "@houston/wire-types";
import type { Browser, BrowserContext, Page } from "playwright-core";
import { watchDialogs } from "./dialogs";
import { watchFence } from "./fence-refusals";
import { DESKTOP_VIEWPORT } from "./live/layout";
import { EMPTY_STATE, type StorageState } from "./state-merge";
import { readState, type StateHolder } from "./state-store";
import { followPages } from "./tab-pages";

export interface BrowserTab extends StateHolder {
  page: Page;
  generation: number;
  layout: BrowserLiveLayout;
  onPageChange: Set<(page: Page) => void>;
  backup?: { host: string; dispose: () => Promise<void> };
}

export async function openTab(
  browser: Browser,
  statePath: string,
  maxPages: number,
): Promise<BrowserTab> {
  const saved = await readState(statePath);
  const context = await browser.newContext({
    ...(saved ? { storageState: saved } : {}),
    viewport: DESKTOP_VIEWPORT,
    acceptDownloads: false,
  });
  return wireTab(context, await context.newPage(), statePath, saved, maxPages);
}

export async function wireTab(
  context: BrowserContext,
  page: Page,
  statePath: string,
  saved: StorageState | undefined,
  maxPages: number,
): Promise<BrowserTab> {
  context.setDefaultTimeout(15_000);
  context.setDefaultNavigationTimeout(30_000);
  const tab: BrowserTab = {
    context,
    page,
    statePath,
    base: {
      cookies: await context.cookies(),
      origins: saved?.origins ?? EMPTY_STATE.origins,
    },
    generation: 0,
    layout: "desktop",
    onPageChange: new Set(),
  };
  followPages(tab, maxPages);
  watchFence(tab);
  watchDialogs(tab);
  return tab;
}
