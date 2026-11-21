import { createServer } from "node:http";
import type { Browser } from "playwright-core";
import { afterAll, describe, expect, test, vi } from "vitest";
import {
  agentWorkspace,
  browserAvailable,
  fixtureLaunch,
  fixturePool,
  listen,
  SITE_HOST,
  tool,
} from "./browser.test-support";
import type { BackupBrowser } from "./kernel-tab";
import { BACKUP_NOTE, BLOCKED_NOTE } from "./open-fallback";
import { openTab } from "./open-tab";
import type { BrowserPool } from "./pool";

const available = await browserAvailable();

const site = createServer((req, res) => {
  const cookies = req.headers.cookie ?? "";
  if (req.url === "/favicon.ico") {
    res.writeHead(404);
    res.end();
    return;
  }
  if (req.url === "/signin") {
    res.writeHead(200, {
      "content-type": "text/html",
      "set-cookie": "sid=ok; Path=/; Max-Age=3600",
    });
    res.end("<title>Signed in</title><h1>Signed in</h1>");
    return;
  }
  if (req.headers["x-backup"] === "1") {
    const signedIn = /(?:^|; )sid=ok/.test(cookies) ? "signed in" : "anonymous";
    const marked = /__cf_bm=/.test(cookies) ? "marked" : "unmarked";
    res.writeHead(200, { "content-type": "text/html" });
    res.end(
      `<title>Products</title><h1>Products</h1><p>${signedIn}, ${marked}</p>`,
    );
    return;
  }
  res.writeHead(403, {
    "content-type": "text/html",
    "set-cookie": "__cf_bm=bot; Path=/; Max-Age=3600",
  });
  res.end(`<title>Just a moment...</title><h1>Checking your browser</h1>
<script>window._cf_chl_opt = { cvId: "3" };</script>`);
});
const origin = available ? `http://${SITE_HOST}:${await listen(site)}` : "";

const browsers: Browser[] = [];
const pools: BrowserPool[] = [];

function fakeKernel(refuse = false) {
  const opened: string[] = [];
  const disposed = vi.fn();
  const backup: BackupBrowser = {
    async open(statePath, maxPages, host) {
      opened.push(host);
      if (refuse) throw new Error("Kernel: 429:concurrency_limit_exceeded");
      const browser = await fixtureLaunch();
      browsers.push(browser);
      const tab = await openTab(browser, statePath, maxPages);
      await tab.context.setExtraHTTPHeaders({ "x-backup": "1" });
      tab.backup = {
        host,
        dispose: async () => {
          disposed();
          await browser.close();
        },
      };
      return tab;
    },
  };
  return { backup, opened, disposed };
}

const pooled = (backup: BackupBrowser | null) => {
  const pool = fixturePool({ backup });
  pools.push(pool);
  return pool;
};

afterAll(async () => {
  await Promise.all(pools.map((pool) => pool.shutdown()));
  await Promise.all(browsers.map((browser) => browser.close()));
  site.closeAllConnections();
  site.close();
});

describe.skipIf(!available)(
  "the Kernel fallback against a real Chromium",
  { timeout: 30_000 },
  () => {
    test("with no backup, a wall is just the page: no note, nothing called", async () => {
      const run = tool(agentWorkspace(), pooled(null));
      const page = await run({ action: "open", url: `${origin}/item` });
      expect(page.text).toMatch(/^Opened /);
      expect(page.text).toContain("Checking your browser");
      expect(page.text).not.toContain(BACKUP_NOTE);
      expect(page.text).not.toContain(BLOCKED_NOTE);
    });

    test("a wall moves the chat to the backup, sign-ins and all, until the tab closes", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const kernel = fakeKernel();
      const pool = pooled(kernel.backup);
      const run = tool(agentWorkspace(), pool);
      await run({ action: "open", url: `${origin}/signin` });
      expect(kernel.opened).toEqual([]);
      const page = await run({ action: "open", url: `${origin}/item` });
      expect(kernel.opened).toEqual([SITE_HOST]);
      expect(page.text.startsWith(BACKUP_NOTE)).toBe(true);
      expect(page.text).toContain("signed in, unmarked");
      const look = await run({ action: "snapshot" });
      expect(look.text).toContain("Products");
      expect(kernel.disposed).not.toHaveBeenCalled();
      expect((await run({ action: "close" })).details.ok).toBe(true);
      expect(kernel.disposed).toHaveBeenCalledOnce();
    });

    test("a refusing backup leaves the local page, with the blocked line", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const error = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      const kernel = fakeKernel(true);
      const run = tool(agentWorkspace(), pooled(kernel.backup));
      const page = await run({ action: "open", url: `${origin}/item` });
      expect(kernel.opened).toEqual([SITE_HOST]);
      expect(page.details.ok).toBe(true);
      expect(page.text.startsWith(BLOCKED_NOTE)).toBe(true);
      expect(page.text).toContain("Checking your browser");
      expect(JSON.stringify(error.mock.calls)).toContain(
        "Kernel fallback failed",
      );
    });

    test("shutting the pool down ends a backup session", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const kernel = fakeKernel();
      const pool = pooled(kernel.backup);
      await tool(
        agentWorkspace(),
        pool,
      )({
        action: "open",
        url: `${origin}/item`,
      });
      await pool.shutdown();
      expect(kernel.disposed).toHaveBeenCalledOnce();
    });
  },
);
