import type { Response } from "playwright-core";
import { type Block, pageBlock } from "./block-detect";
import { isClosedError } from "./live/page-errors";
import type { BrowserTab } from "./open-tab";

const HTML_LIMIT = 200_000;

const KERNEL_PROXY_ERROR = "x-kernel-proxy-error";

export async function readBlock(
  tab: BrowserTab,
  response: Response | null,
): Promise<Block | null> {
  try {
    const proxyError = tab.backup
      ? await response?.headerValue(KERNEL_PROXY_ERROR)
      : null;
    if (proxyError)
      return { reason: "backup_proxy", code: proxyCode(proxyError) };
    const [title, html] = await Promise.all([
      tab.page.title(),
      tab.page.evaluate(
        (limit) => document.documentElement?.outerHTML.slice(0, limit) ?? "",
        HTML_LIMIT,
      ),
    ]);
    return pageBlock({ status: response?.status() ?? null, title, html });
  } catch (error) {
    if (!isClosedError(error))
      console.warn("[browser] reading the page for a block failed", {
        name: error instanceof Error ? error.name : "unknown",
      });
    return null;
  }
}

function proxyCode(value: string): string {
  return /^[\w.-]{1,64}$/.test(value) ? value : "unknown";
}
