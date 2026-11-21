import type { Page } from "playwright-core";
import type { BrowserTab } from "./open-tab";

export const MAX_REMEMBERED_REFS = 20_000;

interface LastLook {
  page: Page;
  document: number;
  refs: ReadonlySet<string>;
}

const lastLooks = new WeakMap<BrowserTab, LastLook>();
const epochs = new WeakMap<BrowserTab, number>();

export async function documentOf(page: Page): Promise<number> {
  return page.evaluate(() => performance.timeOrigin);
}

export function previousRefs(
  tab: BrowserTab,
  page: Page,
  document: number,
): ReadonlySet<string> | undefined {
  const last = lastLooks.get(tab);
  return last?.page === page && last.document === document
    ? last.refs
    : undefined;
}

export function rememberLook(
  tab: BrowserTab,
  page: Page,
  document: number,
  refs: ReadonlySet<string>,
): void {
  if (refs.size > MAX_REMEMBERED_REFS) lastLooks.delete(tab);
  else lastLooks.set(tab, { page, document, refs });
}

export function lookEpoch(tab: BrowserTab): number {
  return epochs.get(tab) ?? 0;
}

export function supersedeLooks(tab: BrowserTab): void {
  epochs.set(tab, lookEpoch(tab) + 1);
}

export class SupersededError extends Error {
  constructor() {
    super("A dialog interrupted this action; a newer one has the page.");
    this.name = "SupersededError";
  }
}
