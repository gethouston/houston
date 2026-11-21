import { afterAll, describe, expect, test } from "vitest";
import { runWithActingContext } from "../../acting-context";
import {
  agentWorkspace,
  browserAvailable,
  fixturePool,
  handoffTool,
  listen,
  SITE_HOST,
  site,
  tool,
} from "./browser.test-support";
import { HandoffRegistry } from "./live/registry";
import type { BrowserPool } from "./pool";

const available = await browserAvailable();
const server = site(() => "http://127.0.0.1:9");
const origin = available ? `http://${SITE_HOST}:${await listen(server)}` : "";
const pool: BrowserPool = fixturePool();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterAll(async () => {
  await pool.shutdown();
  server.closeAllConnections();
  server.close();
});

const workspace = () => agentWorkspace("browser-live-it-");

async function until<T>(probe: () => T | undefined | false): Promise<T> {
  for (let i = 0; i < 200; i += 1) {
    const value = probe();
    if (value) return value;
    await sleep(25);
  }
  throw new Error("timed out waiting");
}

let chats = 0;
function start() {
  chats += 1;
  const chat = `live-it-${chats}`;
  const registry = new HandoffRegistry();
  const run = handoffTool(workspace(), pool, registry, { chat });
  return { run, session: () => until(() => registry.get(chat)) };
}

const handoff = { action: "handoff", text: "Sign in" } as const;
const SECRET_ADDRESS = "/login?username=student&password=Secret1";

describe.skipIf(!available)(
  "the live hand-off against a real Chromium",
  { timeout: 30_000 },
  () => {
    test("Back on a popup with no history closes it and shows the page that opened it", async () => {
      const { run, session: opened } = start();
      const pending = run({ ...handoff, url: `${origin}/popup` });
      const session = await opened();
      const opener = session.tab.page;
      await opener.getByRole("button", { name: "Open sign-in" }).click();
      const popup = await until(
        () => session.tab.page !== opener && session.tab.page,
      );
      await session.apply([{ type: "back" }]);
      await until(() => popup.isClosed());
      expect(session.tab.page).toBe(opener);
      session.finish("done");
      expect((await pending).details.ok).toBe(true);
    });

    test("the browser closing while the person drives it is a page error, not a finish", async () => {
      const { run, session: opened } = start();
      const pending = run(handoff);
      const session = await opened();
      await session.tab.context.close();
      const result = await pending;
      expect(result.details).toMatchObject({
        ok: false,
        error: { code: "page_error" },
      });
      expect(result.text).toContain("The browser closed while the person");
    });

    test("a phone viewer then a desktop viewer: every page is desktop-sized again at the end", async () => {
      const { run, session: opened } = start();
      const pending = run({ ...handoff, url: `${origin}/popup` });
      const session = await opened();
      const opener = session.tab.page;
      await opener.getByRole("button", { name: "Open sign-in" }).click();
      session.attachViewer("viewer-phone-1", "phone", () => true);
      const popup = await until(
        () => session.tab.page !== opener && session.tab.page,
      );
      await until(() => popup.viewportSize()?.width === 412);
      session.attachViewer("viewer-desk-1", "desktop", () => true);
      await until(() => popup.viewportSize()?.width === 1280);
      session.finish("done");
      await pending;
      for (const page of session.tab.context.pages())
        expect(page.viewportSize()).toEqual({ width: 1280, height: 800 });
    });

    test("a password the page put in its address reaches neither the model nor the chat", async () => {
      const run = tool(workspace(), pool);
      const opened = await run({
        action: "open",
        url: `${origin}${SECRET_ADDRESS}`,
      });
      expect(opened.text).toContain("password=[hidden]");
      expect(opened.text).not.toContain("Secret1");
      expect(JSON.stringify(opened.details)).not.toContain("Secret1");

      const { run: hand, session: opened2 } = start();
      const pending = hand({ ...handoff, url: `${origin}${SECRET_ADDRESS}` });
      (await opened2()).finish("done");
      const result = await pending;
      expect(result.details).toMatchObject({ ok: true });
      expect(JSON.stringify(result)).not.toContain("Secret1");
    });

    test("the hand-off belongs to the turn's person: the signed acting-as, else a pooled turn's verified owner, never an unsigned acting user", async () => {
      const token = (sub: string) =>
        `acting-v1.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.sig`;
      for (const [ctx, owner] of [
        [{ actingAs: token("member-signed") }, "member-signed"],
        [
          { actingUser: "member-turn", verifiedOwner: "member-turn" },
          "member-turn",
        ],
        [{ actingUser: "desktop-header" }, undefined],
      ] as const) {
        const { run, session: opened } = start();
        const pending = runWithActingContext(ctx, () => run(handoff));
        const session = await opened();
        expect(session.owner).toBe(owner);
        session.finish("cancelled");
        await pending;
      }
    });
  },
);
