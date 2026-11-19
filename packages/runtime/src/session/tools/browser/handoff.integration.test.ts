import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BrowserLiveEvent } from "@houston/wire-types";
import { afterAll, afterEach, describe, expect, test } from "vitest";
import type { BrowserParams } from "./actions";
import {
  agentWorkspace,
  browserAvailable,
  fixturePool,
  handoffTool,
  listen,
  PASSWORD,
  ref,
  SITE_HOST,
  site,
  tool,
} from "./browser.test-support";
import { HandoffRegistry } from "./live/registry";
import type { HandoffSession } from "./live/session";
import type { BrowserPool, BrowserPoolOptions } from "./pool";
import { browserStatePath } from "./state-store";
import type { HandoffBudget } from "./tool";

const available = await browserAvailable();
const server = site(() => "http://127.0.0.1:9");
const origin = available ? `http://${SITE_HOST}:${await listen(server)}` : "";

const pools: BrowserPool[] = [];
const newPool = (options: BrowserPoolOptions = {}) => {
  const pool = fixturePool(options);
  pools.push(pool);
  return pool;
};
const workspace = () => agentWorkspace("browser-handoff-it-");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until<T>(probe: () => T | undefined | false): Promise<T> {
  for (let i = 0; i < 200; i += 1) {
    const value = probe();
    if (value) return value;
    await sleep(25);
  }
  throw new Error("timed out waiting");
}

// A test that fails mid hand-off leaves its run waiting on the person, and
// that run holds its pool's queue: shutdown() would wait behind it and turn
// one failure into a hook timeout that hides it. Stopping the test's turn
// ends the hand-off whether or not it has opened yet.
let stopTurn = new AbortController();
afterEach(() => {
  stopTurn.abort();
  stopTurn = new AbortController();
});

afterAll(async () => {
  await Promise.all(pools.map((pool) => pool.shutdown()));
  server.closeAllConnections();
  server.close();
});

/** Where an element sits in the frame, 0..1 the way the live view sends it. */
async function spot(session: HandoffSession, selector: string) {
  const page = session.tab.page;
  const box = await page.locator(selector).boundingBox();
  const size = page.viewportSize();
  if (!box || !size) throw new Error(`no ${selector} on the page`);
  return {
    x: (box.x + box.width / 2) / size.width,
    y: (box.y + box.height / 2) / size.height,
  };
}

function start(
  options: {
    limitMs?: number;
    budget?: HandoffBudget;
    pool?: BrowserPool;
  } = {},
) {
  const registry = new HandoffRegistry();
  const ws = workspace();
  const pool = options.pool ?? newPool();
  const live = handoffTool(ws, pool, registry, options);
  const { signal: stopped } = stopTurn;
  const run = (params: BrowserParams, signal?: AbortSignal) =>
    live(params, signal ? AbortSignal.any([signal, stopped]) : stopped);
  return { registry, ws, pool, run };
}

const handoff = {
  action: "handoff",
  text: "Sign in to the test site",
} as const;

describe.skipIf(!available)(
  "browser hand-off against a real Chromium",
  { timeout: 30_000 },
  () => {
    test("the person signs in through the live view; the model gets the page, never the password", async () => {
      const { registry, ws, run } = start();
      const pending = run({ ...handoff, url: `${origin}/login` });
      const session = await until(() => registry.get("chat"));
      await session.apply([
        {
          type: "mouse",
          action: "click",
          ...(await spot(session, "input[name=username]")),
        },
        { type: "text", text: "student" },
        { type: "key", key: "Tab" },
        { type: "text", text: PASSWORD },
        { type: "key", key: "Enter" },
      ]);
      await session.tab.page.waitForURL(/\/secure$/);
      session.finish("done");
      const result = await pending;
      expect(result.details).toMatchObject({ ok: true, action: "handoff" });
      expect(result.text).toContain(
        'The person finished: "Sign in to the test site"',
      );
      expect(result.text).toContain("Welcome back, student");
      expect(result.text).not.toContain(PASSWORD);
      expect(readFileSync(browserStatePath(ws), "utf8")).toContain('"sid"');
    });

    test("a hand-off outlasts the per-action deadline: it waits on the person", async () => {
      const { registry, run } = start({ pool: newPool({ deadlineMs: 300 }) });
      const pending = run({ ...handoff, url: `${origin}/login` });
      const session = await until(() => registry.get("chat"));
      await sleep(900);
      session.finish("done");
      const result = await pending;
      expect(result.details).toMatchObject({ ok: true, action: "handoff" });
    });

    test("nobody finishing in time ends the hand-off as expired", async () => {
      const { registry, run } = start({ limitMs: 200 });
      const result = await run(handoff);
      expect(result.details).toMatchObject({
        ok: false,
        error: { code: "handoff_expired" },
      });
      expect(registry.get("chat")?.state).toBe("expired");
    });

    test("the live view's deadline is the budget the hand-off was given", async () => {
      const { registry, run } = start({ limitMs: 90_000 });
      const pending = run(handoff);
      const session = await until(() => registry.get("chat"));
      const left = session.expiresAt - Date.now();
      expect(left).toBeGreaterThan(85_000);
      expect(left).toBeLessThanOrEqual(90_000);
      session.finish("cancelled");
      await pending;
    });

    test("the budget is read again once the page is up, so loading it comes off", async () => {
      const left = [60_000, 30_000];
      const { registry, run } = start({ budget: () => left.shift() ?? null });
      const pending = run({ ...handoff, url: `${origin}/login` });
      const session = await until(() => registry.get("chat"));
      expect(session.tab.page.url()).toBe(`${origin}/login`);
      expect(session.expiresAt - Date.now()).toBeLessThanOrEqual(30_000);
      session.finish("cancelled");
      await pending;
      expect(left).toEqual([]);
    });

    test("a page that loads past the turn's end refuses the hand-off after loading", async () => {
      const left: (number | null)[] = [60_000, null];
      const { registry, run } = start({ budget: () => left.shift() ?? null });
      const result = await run({ ...handoff, url: `${origin}/login` });
      expect(result.details).toMatchObject({
        ok: false,
        error: { code: "handoff_unavailable" },
      });
      expect(result.text).toMatch(/run too long/);
      expect(registry.get("chat")).toBeUndefined();
    });

    test("a stopped turn ends the hand-off at once and frees the browser", async () => {
      const { registry, run } = start();
      const stop = new AbortController();
      const pending = run(handoff, stop.signal);
      await until(() => registry.get("chat"));
      const stoppedAt = Date.now();
      stop.abort();
      const result = await pending;
      expect(Date.now() - stoppedAt).toBeLessThan(1_000);
      expect(result.details).toMatchObject({
        ok: false,
        error: { code: "handoff_cancelled" },
      });
      const next = await run({ action: "open", url: `${origin}/login` });
      expect(next.details.ok).toBe(true);
    });

    test("the idle sweep never closes a page the person is using", async () => {
      const { registry, run } = start({ pool: newPool({ idleMs: 150 }) });
      const pending = run({ ...handoff, url: `${origin}/login` });
      const session = await until(() => registry.get("chat"));
      await sleep(600);
      expect(session.tab.page.isClosed()).toBe(false);
      expect(session.tab.context.browser()?.isConnected()).toBe(true);
      session.finish("done");
      expect((await pending).details.ok).toBe(true);
    });

    test("a phone viewer gets a phone-sized page, restored when the hand-off ends", async () => {
      const { registry, run } = start();
      const pending = run({ ...handoff, url: `${origin}/login` });
      const session = await until(() => registry.get("chat"));
      const seen: BrowserLiveEvent[] = [];
      session.attachViewer("viewer-phone-1", "phone", (event) => {
        seen.push(event);
        return true;
      });
      await until(() => session.tab.page.viewportSize()?.width === 412);
      const frame = await until(() =>
        seen.find((e) => e.type === "frame" && e.width === 412),
      );
      expect(frame).toMatchObject({ height: 860 });
      expect(seen[0]).toMatchObject({ type: "status", state: "waiting" });
      expect(seen.findIndex((e) => e.type === "page")).toBeLessThan(
        seen.indexOf(frame),
      );
      session.finish("done");
      await pending;
      expect(session.tab.page.viewportSize()).toEqual({
        width: 1280,
        height: 800,
      });
      expect(seen.at(-1)).toMatchObject({ type: "status", state: "done" });
    });

    test("the tab follows a popup the page opens, and the old refs go stale", async () => {
      const run = tool(workspace(), newPool());
      const opened = await run({ action: "open", url: `${origin}/popup` });
      const stay = ref(opened.text, "button", "Stay");
      // The model's click is a real input event: popup blocking lets it open.
      await run({
        action: "click",
        ref: ref(opened.text, "button", "Open sign-in"),
      });
      await sleep(500);
      expect((await run({ action: "click", ref: stay })).details).toMatchObject(
        {
          ok: false,
          error: { code: "stale_ref" },
        },
      );
      expect((await run({ action: "snapshot" })).text).toContain(
        "Page: Sign in",
      );
    });

    test("over eight pages the oldest close, never the current page or its direct opener", async () => {
      const pool = newPool();
      const tab = await pool.run(
        "k",
        join(workspace(), "state.json"),
        async (t) => t,
      );
      await tab.page.goto(`${origin}/login`);
      const first = tab.page;
      const open = async (from: typeof first) => {
        const popup = from.waitForEvent("popup");
        await from.evaluate(() => window.open("/login"));
        return popup;
      };
      const opener = await open(first);
      for (let i = 0; i < 9; i += 1) await open(opener);
      await until(() => tab.context.pages().length <= 8);
      await sleep(200);
      expect(tab.context.pages()).toHaveLength(8);
      // The opener's own opener is just the oldest page: it goes first.
      expect(first.isClosed()).toBe(true);
      expect(opener.isClosed()).toBe(false);
      expect(tab.page.isClosed()).toBe(false);
      expect(await tab.page.opener()).toBe(opener);
    });
  },
);
