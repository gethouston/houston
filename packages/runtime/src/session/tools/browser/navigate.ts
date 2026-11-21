import type { Page, Response } from "playwright-core";
import { BrowserToolError } from "./errors";
import { fenceRefusal, takeFenceRefusal } from "./fence-refusals";
import type { BrowserTab } from "./open-tab";
import { landedSafely, refusalText } from "./url-policy";

export async function settle(page: Page): Promise<void> {
  try {
    await page.waitForLoadState("load", { timeout: 5_000 });
  } catch (error) {
    if (!(error instanceof Error && error.name === "TimeoutError")) throw error;
  }
}

export async function guardLanding(tab: BrowserTab): Promise<void> {
  const fenced = takeFenceRefusal(tab);
  if (fenced !== null) {
    await tab.page.goto("about:blank");
    throw fenceRefusal(fenced);
  }
  const url = tab.page.url();
  if (landedSafely(url)) return;
  if (url.startsWith("chrome-error:"))
    throw new BrowserToolError(
      "page_error",
      "That page did not load. Check the address, or try again.",
    );
  await tab.page.goto("about:blank");
  throw new BrowserToolError(
    "url_refused",
    refusalText(
      "That page sent the browser somewhere it may not go, so it was stopped.",
      URL.canParse(url) ? new URL(url).hostname : "",
    ),
  );
}

async function goto(page: Page, href: string): Promise<Response | null> {
  try {
    return await page.goto(href, { waitUntil: "commit" });
  } catch (error) {
    if (error instanceof Error && error.message.includes("net::ERR_"))
      await errorPageCommitted(page);
    throw error;
  }
}

export async function openUrl(
  tab: BrowserTab,
  href: string,
): Promise<Response | null> {
  try {
    return await goto(tab.page, href);
  } catch (error) {
    const fenced = takeFenceRefusal(tab, new URL(href).hostname);
    if (fenced !== null) throw fenceRefusal(fenced);
    throw error;
  }
}

async function errorPageCommitted(page: Page): Promise<void> {
  try {
    await page.waitForURL((url) => url.protocol === "chrome-error:", {
      timeout: 2_000,
    });
  } catch (error) {
    if (!(error instanceof Error && error.name === "TimeoutError")) throw error;
  }
}
