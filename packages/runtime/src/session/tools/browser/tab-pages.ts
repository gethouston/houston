import type { Page } from "playwright-core";
import { fitPage } from "./live/layout";
import { isClosedError } from "./live/page-errors";
import type { BrowserTab } from "./open-tab";
import { nextGeneration } from "./refs";

const closing = new WeakSet<BrowserTab>();

export async function closeContext(tab: BrowserTab): Promise<void> {
  closing.add(tab);
  await (tab.backup ? tab.backup.dispose() : tab.context.close());
}

export const MAX_TAB_PAGES = 8;

export const TURN_MAX_TAB_PAGES = 3;

type PageEnv = Record<string, string | undefined>;

export function maxTabPages(env: PageEnv): number {
  return env.HOUSTON_MODE === "turn" ? TURN_MAX_TAB_PAGES : MAX_TAB_PAGES;
}

export function followPages(tab: BrowserTab, maxPages: number): void {
  watchClose(tab, tab.page);
  let trimming = Promise.resolve();
  tab.context.on("page", (page) => {
    watchClose(tab, page);
    switchTo(tab, page);
    trimming = trimming
      .then(() => capPages(tab, maxPages))
      .catch((error: unknown) =>
        console.warn("[browser] trimming old pages failed", error),
      );
  });
}

function watchClose(tab: BrowserTab, page: Page): void {
  page.on("close", () => {
    if (tab.page !== page || closing.has(tab)) return;
    if (!tab.context.browser()?.isConnected()) return;
    const rest = tab.context.pages().filter((p) => !p.isClosed());
    const fallback = rest.at(-1);
    if (fallback) {
      switchTo(tab, fallback);
      return;
    }
    tab.context.newPage().then(
      () => undefined,
      (error: unknown) => {
        if (!isClosedError(error))
          console.warn("[browser] reopening a page failed", error);
      },
    );
  });
}

function switchTo(tab: BrowserTab, page: Page): void {
  tab.page = page;
  tab.generation = nextGeneration();
  fitPage(tab, page)
    .catch((error: unknown) => {
      if (!isClosedError(error))
        console.warn("[browser] sizing a new page failed", error);
    })
    .finally(() => {
      if (tab.page !== page) return;
      for (const listener of tab.onPageChange) listener(page);
    });
}

async function capPages(tab: BrowserTab, maxPages: number): Promise<void> {
  const open = tab.context.pages().filter((p) => !p.isClosed());
  if (open.length <= maxPages) return;
  const current = tab.page;
  const opener = await current.opener();
  const kept = new Set<Page>(opener ? [current, opener] : [current]);
  const spare = open.filter((p) => !kept.has(p));
  const excess = open.length - maxPages;
  await Promise.all(
    spare.slice(0, excess).map((page) =>
      page.close().catch((error: unknown) => {
        console.warn("[browser] closing an old page failed", error);
      }),
    ),
  );
}
