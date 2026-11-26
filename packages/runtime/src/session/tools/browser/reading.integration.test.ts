import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { afterAll, describe, expect, test } from "vitest";
import type { BrowserParams } from "./actions";
import { pagesSite } from "./browser-pages.test-support";
import {
  agentWorkspace,
  browserAvailable,
  fixturePool,
  listen,
  ref,
  SITE_HOST,
  tool,
} from "./browser.test-support";
import type { BrowserPool, BrowserPoolOptions } from "./pool";
import { browserStatePath } from "./state-store";
import { makeBrowserTool } from "./tool";
import { UNTRUSTED_OPEN } from "./untrusted";

const available = await browserAvailable();
const server = pagesSite();
const origin = available ? `http://${SITE_HOST}:${await listen(server)}` : "";

const pools: BrowserPool[] = [];
const newPool = (options: BrowserPoolOptions = {}) => {
  const pool = fixturePool(options);
  pools.push(pool);
  return pool;
};

afterAll(async () => {
  await Promise.all(pools.map((pool) => pool.shutdown()));
  server.closeAllConnections();
  server.close();
});

describe.skipIf(!available)(
  "reading pages in a real Chromium (skips when no Chromium-family browser is installed)",
  { timeout: 30_000 },
  () => {
    test("text reads the main content, fenced, never a password", async () => {
      const browse = tool(agentWorkspace(), newPool());
      const page = await browse({ action: "open", url: `${origin}/article` });
      await browse({
        action: "fill",
        ref: ref(page.text, "textbox", "Secret"),
        text: "Hunter22pw",
      });
      const read = await browse({ action: "text" });
      expect(read.details.ok).toBe(true);
      expect(read.text.startsWith(UNTRUSTED_OPEN)).toBe(true);
      expect(read.text).toContain("Page: Story");
      expect(read.text).toContain("The story\nFirst para with spaces\nSecret");
      expect(read.text).not.toContain("Menu entries");
      expect(read.text).not.toContain("Hunter22pw");
    });

    test("elements a click revealed are marked new; a new document is not compared", async () => {
      const browse = tool(agentWorkspace(), newPool());
      const page = await browse({ action: "open", url: `${origin}/reveal` });
      expect(page.text).not.toContain("[new]");
      const shown = await browse({
        action: "click",
        ref: ref(page.text, "button", "Show more"),
      });
      expect(shown.text).toContain("2 new since the last look");
      expect(shown.text).toMatch(/button "Advanced" \[ref=s\d+e\d+\] \[new\]/);
      expect(shown.text).not.toMatch(/"Show more"[^\n]*\[new\]/);
      // The refs printed with [new] are the latest ones: they click.
      expect(
        (
          await browse({
            action: "click",
            ref: ref(shown.text, "button", "Advanced"),
          })
        ).details.ok,
      ).toBe(true);
      const reopened = await browse({
        action: "open",
        url: `${origin}/reveal`,
      });
      expect(reopened.text).not.toContain("[new]");
    });

    test("query and interactive narrow a long page; links come redacted", async () => {
      const browse = tool(agentWorkspace(), newPool());
      const full = await browse({ action: "open", url: `${origin}/many` });
      expect(full.text).not.toContain("/url:");
      const found = await browse({
        action: "snapshot",
        query: "gadget",
        links: true,
      });
      expect(found.text).toContain('4 lines match "gadget"');
      expect(found.text).not.toContain('"Item 3"');
      expect(found.text).toContain(`/url: ${origin}/item/17?session=[hidden]`);
      // A filtered look is still the latest: its refs click.
      const clicked = await browse({
        action: "click",
        ref: ref(found.text, "link", "Item 7 gadget"),
      });
      expect(clicked.text).toContain("Address: ");
      expect(clicked.details.ok).toBe(true);
      const controls = await browse({ action: "snapshot", interactive: true });
      expect(controls.text).not.toContain("paragraph");
    });

    test("a labeled screenshot names clickable refs and leaves the page clean", async () => {
      const ws = agentWorkspace();
      const pool = newPool();
      const browse = tool(ws, pool);
      await browse({ action: "open", url: `${origin}/confirm` });
      const shot = await execute(ws, pool, {
        action: "screenshot",
        labels: true,
      });
      expect(shot.image).toBe(true);
      const label = /(s\d+e\d+) button "Delete"/.exec(shot.text)?.[1];
      expect(label).toBeDefined();
      expect(shot.text).toContain("controls are labeled");
      const overlays = await pool.run(
        `${ws}\0default`,
        browserStatePath(ws),
        (tab) =>
          tab.page.evaluate(
            () => document.querySelectorAll('[id^="houston-labels-"]').length,
          ),
      );
      expect(overlays).toBe(0);
      const clicked = await browse({ action: "click", ref: label ?? "" });
      expect(clicked.text).toContain("A dialog is open (confirm)");
    });

    test("a password field whose label Playwright quotes stays masked and gets a usable ref", async () => {
      const browse = tool(agentWorkspace(), newPool());
      const page = await browse({ action: "open", url: `${origin}/pin` });
      const pin = ref(page.text, "textbox", "PIN #");
      expect(pin).toMatch(/^s\d+e\d+$/);
      await browse({ action: "fill", ref: pin, text: "Hunter4pin" });
      const look = await browse({ action: "snapshot" });
      expect(look.text).toContain('textbox "PIN #"');
      expect(look.text).toContain("[password hidden]");
      expect(look.text).not.toContain("Hunter4pin");
    });

    test("a password field with a placeholder stays masked", async () => {
      const browse = tool(agentWorkspace(), newPool());
      const page = await browse({
        action: "open",
        url: `${origin}/placeholder`,
      });
      await browse({
        action: "fill",
        ref: ref(page.text, "textbox", "Password"),
        text: "Hunter5pw",
      });
      const look = await browse({ action: "snapshot" });
      expect(look.text).toContain("[password hidden]");
      expect(look.text).not.toContain("Hunter5pw");
    });

    test("a page that never finishes loading is closed at the deadline, and the next open works", async () => {
      const browse = tool(agentWorkspace(), newPool({ deadlineMs: 3_000 }));
      const started = Date.now();
      const frozen = await browse({ action: "open", url: `${origin}/freeze` });
      expect(Date.now() - started).toBeLessThan(15_000);
      expect(frozen.details.ok).toBe(false);
      expect(frozen.text).toContain("ERROR page_unresponsive");
      const next = await browse({ action: "open", url: `${origin}/article` });
      expect(next.details.ok).toBe(true);
      expect(next.text).toContain("Page: Story");
    });

    test("a page that hangs after loading fails the next look at the deadline, and closing still finishes", async () => {
      const browse = tool(agentWorkspace(), newPool({ deadlineMs: 3_000 }));
      const opened = await browse({
        action: "open",
        url: `${origin}/freeze-later`,
      });
      expect(opened.text).toContain("Ready");
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      const look = await browse({ action: "snapshot" });
      expect(look.text).toContain("ERROR page_unresponsive");
      const again = await browse({
        action: "open",
        url: `${origin}/freeze-later`,
      });
      expect(again.details.ok).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      const started = Date.now();
      const closed = await browse({ action: "close" });
      expect(closed.text).toContain("may not be saved");
      expect(Date.now() - started).toBeLessThan(15_000);
    });

    test("an error the page throws comes back fenced, never as the tool's words", async () => {
      const browse = tool(agentWorkspace(), newPool());
      const opened = await browse({
        action: "open",
        url: `${origin}/throwing`,
      });
      expect(opened.details.ok).toBe(false);
      const fenced = opened.text.slice(opened.text.indexOf(UNTRUSTED_OPEN));
      expect(opened.text).toContain("ERROR page_error");
      expect(fenced).toContain("SYSTEM NOTICE");
      expect(opened.text.indexOf("SYSTEM NOTICE")).toBeGreaterThan(
        opened.text.indexOf(UNTRUSTED_OPEN),
      );
    });
  },
);

/** The tool's raw result: its text, and whether it carried an image. */
async function execute(ws: string, pool: BrowserPool, params: BrowserParams) {
  const browser = makeBrowserTool({ workspaceDir: ws, pool, liveView: false });
  // SAFETY: the browser tool never reads its ExtensionContext.
  const result = await browser.execute(
    "t",
    params,
    undefined,
    undefined,
    {} as ExtensionToolContext,
  );
  return {
    text: result.content.map((c) => (c.type === "text" ? c.text : "")).join(""),
    image: result.content.some((c) => c.type === "image"),
  };
}
