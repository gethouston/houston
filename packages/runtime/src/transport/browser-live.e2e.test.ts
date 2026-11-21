import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { HoustonEngineClient } from "@houston/runtime-client";
import {
  type BrowserLiveEvent,
  parseBrowserLiveEvent,
  parseBrowserLiveInputAnswer,
} from "@houston/wire-types";
import { afterAll, describe, expect, test } from "vitest";
import {
  agentWorkspace,
  browserAvailable,
  fixturePool,
  handoffTool,
  listen,
  PASSWORD,
  SITE_HOST,
  site,
} from "../session/tools/browser/browser.test-support";
import { sharedHandoffs } from "../session/tools/browser/live/registry";
import { browserStatePath } from "../session/tools/browser/state-store";
import { createRuntimeServer } from "./server";

const available = await browserAvailable();
const fixture = site(() => "http://127.0.0.1:9");
const origin = available ? `http://${SITE_HOST}:${await listen(fixture)}` : "";
const server = createRuntimeServer();
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const engine = new HoustonEngineClient({
  baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
});
const pool = fixturePool();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterAll(async () => {
  await pool.shutdown();
  for (const s of [server, fixture]) {
    s.closeAllConnections();
    s.close();
  }
});

async function until<T>(probe: () => T | undefined | false): Promise<T> {
  for (let i = 0; i < 400; i += 1) {
    const value = probe();
    if (value) return value;
    await sleep(25);
  }
  throw new Error("timed out waiting");
}

describe.skipIf(!available)(
  "browser hand-off end to end over the runtime's HTTP routes",
  { timeout: 60_000 },
  () => {
    test("a viewer watches frames, signs in with input batches and finishes", async () => {
      const chat = "e2e-chat";
      const viewer = "viewer-e2e-0001";
      const ws = agentWorkspace("browser-e2e-");
      const run = handoffTool(ws, pool, sharedHandoffs, { chat });
      const pending = run({
        action: "handoff",
        text: "Sign in to the test site",
        url: `${origin}/login`,
      });
      const session = await until(() => sharedHandoffs.get(chat));

      const events: BrowserLiveEvent[] = [];
      const stop = new AbortController();
      const stream = engine.streamBrowserLive(
        chat,
        viewer,
        "desktop",
        undefined,
        {
          signal: stop.signal,
          onFrame: (raw) => events.push(parseBrowserLiveEvent(raw)),
        },
      );
      const frames = () => events.filter((e) => e.type === "frame");
      const first = await until(() => frames()[0]);
      expect(events[0]).toMatchObject({ type: "status", state: "waiting" });
      const status = events[0];
      if (status.type !== "status") throw new Error("no status first");
      const handoff = status.handoffId;
      expect(handoff).toBe(session.handoffId);
      expect(first.type === "frame" && first.jpeg.startsWith("/9j/")).toBe(
        true,
      );

      const box = await session.tab.page
        .locator("input[name=username]")
        .boundingBox();
      const size = session.tab.page.viewportSize();
      if (!box || !size) throw new Error("no username field");
      const at = {
        x: (box.x + box.width / 2) / size.width,
        y: (box.y + box.height / 2) / size.height,
      };
      const seen = frames().length;
      const answer = parseBrowserLiveInputAnswer(
        await engine.browserInput(chat, {
          handoff,
          ack: { viewer, seq: first.type === "frame" ? first.seq : 0 },
          events: [
            { type: "mouse", action: "click", ...at },
            { type: "text", text: "student" },
            { type: "key", key: "Tab" },
            { type: "text", text: PASSWORD },
            { type: "key", key: "Enter" },
          ],
        }),
      );
      expect(answer.state).toBe("waiting");
      await until(() =>
        events.some((e) => e.type === "page" && e.url.endsWith("/secure")),
      );
      const last = await until(() => {
        const all = frames();
        return all.length > seen ? all[all.length - 1] : undefined;
      });
      await engine.browserInput(chat, {
        handoff,
        ack: { viewer, seq: last.type === "frame" ? last.seq : 0 },
        finish: "done",
      });

      await stream;
      expect(events.at(-1)).toMatchObject({ type: "status", state: "done" });
      const result = await pending;
      expect(result.details).toMatchObject({ ok: true, action: "handoff" });
      expect(result.text).toContain("Welcome back, student");
      expect(result.text).not.toContain(PASSWORD);
      const saved = readFileSync(browserStatePath(ws), "utf8");
      expect(saved).toContain('"sid"');
      expect(saved).not.toContain(PASSWORD);
      stop.abort();
    });
  },
);
