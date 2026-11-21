import type { Browser } from "playwright-core";
import { afterAll, describe, expect, test } from "vitest";
import { runWithConversationId } from "../../conversation-context";
import {
  agentWorkspace,
  browserAvailable,
  fixtureLaunch,
  fixturePool,
  listen,
  localService,
  PASSWORD,
  ref,
  SITE_HOST,
  site,
  tool,
} from "./browser.test-support";
import type { BrowserPool } from "./pool";
import { STILL_LOADING } from "./snapshot";

const available = await browserAvailable();
const local = localService();
const localPort = available ? await listen(local.server) : 0;
const server = site(() => `http://127.0.0.1:${localPort}`);
const origin = available ? `http://${SITE_HOST}:${await listen(server)}` : "";

const pools: BrowserPool[] = [];
const newPool = () => {
  const pool = fixturePool();
  pools.push(pool);
  return pool;
};
const workspace = () => agentWorkspace("browser-it-");

afterAll(async () => {
  await Promise.all(pools.map((pool) => pool.shutdown()));
  server.closeAllConnections();
  server.close();
  local.server.close();
});

async function signIn(run: ReturnType<typeof tool>) {
  const login = await run({ action: "open", url: `${origin}/login` });
  expect(login.details.ok).toBe(true);
  const named = await run({
    action: "fill",
    ref: ref(login.text, "textbox", "Username"),
    text: "student",
  });
  const filled = await run({
    action: "fill",
    ref: ref(named.text, "textbox", "Password"),
    text: PASSWORD,
  });
  expect(filled.text).toContain("Filled the password field");
  expect(filled.text).not.toContain(PASSWORD);
  return run({ action: "click", ref: ref(filled.text, "button", "Sign in") });
}

describe.skipIf(!available)(
  "browser tool against a real Chromium (skips when no Chromium-family browser is installed)",
  { timeout: 30_000 },
  () => {
    test("a sign-in survives closing the browser and a fresh process", async () => {
      const ws = workspace();
      const first = newPool();
      const run = tool(ws, first);
      expect((await signIn(run)).text).toContain("Welcome back, student");
      expect((await run({ action: "close" })).details.ok).toBe(true);
      await first.shutdown();

      const second = tool(ws, newPool());
      const secure = await second({ action: "open", url: `${origin}/secure` });
      expect(secure.text).toContain("Welcome back, student");

      const stranger = tool(workspace(), newPool());
      expect(
        (await stranger({ action: "open", url: `${origin}/secure` })).text,
      ).toContain("Please sign in");
    });

    test("a chat opened earlier never erases another chat's sign-in", async () => {
      const ws = workspace();
      const pool = newPool();
      const run = tool(ws, pool);
      const inChat = <T>(id: string, fn: () => Promise<T>) =>
        runWithConversationId(id, fn);
      await inChat("b", () => run({ action: "open", url: `${origin}/login` }));
      await inChat("a", () => signIn(run));
      await inChat("b", () => run({ action: "open", url: `${origin}/login` }));
      const fresh = tool(ws, newPool());
      expect(
        (await fresh({ action: "open", url: `${origin}/secure` })).text,
      ).toContain("Welcome back, student");
    });

    test("nothing on this machine is reachable, not even through a redirect", async () => {
      const run = tool(workspace(), newPool());
      const bounced = await run({ action: "open", url: `${origin}/bounce` });
      expect(bounced.details).toMatchObject({
        ok: false,
        error: { code: "url_refused" },
      });
      const direct = await run({
        action: "open",
        url: `http://127.0.0.1:${localPort}/`,
      });
      expect(direct.details).toMatchObject({
        ok: false,
        error: { code: "url_refused" },
      });
      for (const refused of [bounced, direct])
        expect(refused.text).not.toContain("blocked on purpose");
      const sneaky = await run({ action: "open", url: `${origin}/sneaky` });
      expect(sneaky.text).toContain("Hello");
      await run({ action: "wait", ms: 500 });
      expect(local.hits).toEqual([]);
    });

    test("calls for one chat run in order; a close mid-flight is safe", async () => {
      const run = tool(workspace(), newPool());
      const results = await Promise.all([
        run({ action: "open", url: `${origin}/login` }),
        run({ action: "close" }),
        run({ action: "open", url: `${origin}/secure` }),
      ]);
      expect(results.map((r) => r.details.ok)).toEqual([true, true, true]);
      expect(results[2]?.text).toContain("Please sign in");
    });

    test("an idle chat's context is closed, and the browser with the last one", async () => {
      let launched: Browser | undefined;
      const pool = fixturePool({
        idleMs: 150,
        launch: async () => {
          launched = await fixtureLaunch();
          return launched;
        },
      });
      pools.push(pool);
      const run = tool(workspace(), pool);
      await run({ action: "open", url: `${origin}/login` });
      expect(launched?.isConnected()).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(launched?.isConnected()).toBe(false);
      const again = await run({ action: "open", url: `${origin}/secure` });
      expect(again.details.ok).toBe(true);
    });

    test("a page held back by a stalled script opens as still loading", async () => {
      const run = tool(workspace(), newPool());
      const stalled = await run({ action: "open", url: `${origin}/stall` });
      expect(stalled.details.ok).toBe(true);
      expect(stalled.text).toContain(STILL_LOADING);
    });

    test("a ref the page no longer has is a page error the model can recover from", async () => {
      const run = tool(workspace(), newPool());
      const login = await run({ action: "open", url: `${origin}/login` });
      const prefix = ref(login.text, "button", "Sign in").replace(/e\d+$/, "");
      const gone = await run({ action: "click", ref: `${prefix}e999` });
      expect(gone.details).toMatchObject({
        ok: false,
        error: { code: "page_error" },
      });
    });

    test("a ref from an older snapshot, or with no generation, is refused as stale", async () => {
      const run = tool(workspace(), newPool());
      const first = await run({ action: "open", url: `${origin}/login` });
      const button = ref(first.text, "button", "Sign in");
      await run({ action: "snapshot" });
      for (const stale of [button, button.replace(/^s\d+/, "")])
        expect(
          (await run({ action: "click", ref: stale })).details,
        ).toMatchObject({ ok: false, error: { code: "stale_ref" } });
    });
  },
);
