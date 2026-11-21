import type { Browser, Request } from "playwright-core";
import { BrowserToolError } from "./errors";
import type { FenceProxy } from "./fence-proxy";
import { FENCE_HEADER } from "./fence-wire";
import type { BrowserTab } from "./open-tab";
import { refusalText } from "./url-policy";

const fences = new WeakMap<Browser, FenceProxy>();

const refusedTabs = new WeakMap<BrowserTab, string>();

export function bindFence(browser: Browser, proxy: FenceProxy): void {
  fences.set(browser, proxy);
}

function fenceOf(tab: BrowserTab): FenceProxy | undefined {
  const browser = tab.context.browser();
  return browser ? fences.get(browser) : undefined;
}

function isPageNavigation(request: Request): boolean {
  if (!request.isNavigationRequest()) return false;
  try {
    return request.frame().parentFrame() === null;
  } catch (error) {
    if (
      error instanceof Error &&
      /^Frame for this navigation/.test(error.message)
    )
      return true;
    console.error("[browser] reading a navigation's frame failed", error);
    return false;
  }
}

function hostOf(url: string): string {
  return URL.canParse(url) ? new URL(url).hostname : "";
}

export function watchFence(tab: BrowserTab): void {
  const fence = fenceOf(tab);
  if (!fence) return;
  tab.context.on("requestfailed", (request) => {
    const host = hostOf(request.url());
    if (isPageNavigation(request) && fence.refused(host))
      refusedTabs.set(tab, host);
  });
  tab.context.on("response", (response) => {
    const request = response.request();
    const host = hostOf(request.url());
    if (
      isPageNavigation(request) &&
      response.headers()[FENCE_HEADER] === "refused" &&
      fence.refused(host)
    )
      refusedTabs.set(tab, host);
  });
}

export function clearFenceRefusal(tab: BrowserTab): void {
  refusedTabs.delete(tab);
}

export function fenceRefusal(host: string): BrowserToolError {
  return new BrowserToolError(
    "url_refused",
    refusalText(
      "That address is not on the public web, so the browser did not open it.",
      host,
    ),
  );
}

export function takeFenceRefusal(
  tab: BrowserTab,
  host?: string,
): string | null {
  const refused =
    refusedTabs.get(tab) ??
    (host !== undefined && fenceOf(tab)?.refused(host) === true ? host : null);
  refusedTabs.delete(tab);
  return refused;
}
