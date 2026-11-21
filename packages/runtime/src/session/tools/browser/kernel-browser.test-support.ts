import { EventEmitter } from "node:events";
import type { Browser } from "playwright-core";
import { vi } from "vitest";

export function fakeBrowser() {
  const browser = new EventEmitter() as EventEmitter & Record<string, unknown>;
  const page = Object.assign(new EventEmitter(), {
    setViewportSize: vi.fn(async () => undefined),
  });
  const context = Object.assign(new EventEmitter(), {
    setDefaultTimeout: () => undefined,
    setDefaultNavigationTimeout: () => undefined,
    cookies: async () => [],
    pages: () => [page],
    setStorageState: vi.fn(async () => undefined),
    browser: () => browser,
  });
  let connected = true;
  Object.assign(browser, {
    contexts: () => [context],
    isConnected: () => connected,
    close: vi.fn(async () => {
      connected = false;
      browser.emit("disconnected");
    }),
  });
  const drop = () => browser.emit("disconnected");
  return { browser: browser as unknown as Browser, page, context, drop };
}
