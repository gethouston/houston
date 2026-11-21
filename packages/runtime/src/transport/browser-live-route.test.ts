import { EventEmitter } from "node:events";
import type { AddressInfo } from "node:net";
import {
  BROWSER_LIVE_FRAME_WINDOW,
  BROWSER_LIVE_FRAME_WINDOW_BYTES,
  type BrowserLiveEvent,
} from "@houston/wire-types";
import { afterAll, expect, test } from "vitest";
import { sharedHandoffs } from "../session/tools/browser/live/registry";
import type { BrowserTab } from "../session/tools/browser/open-tab";
import { createRuntimeServer } from "./server";

class FakeCdp extends EventEmitter {
  sent: string[] = [];
  async send(method: string): Promise<unknown> {
    this.sent.push(method);
    return method === "Page.captureScreenshot" ? { data: "STILL" } : {};
  }
  async detach(): Promise<void> {}
  paint(jpeg: string): void {
    this.emit("Page.screencastFrame", {
      data: jpeg,
      sessionId: 1,
      metadata: { deviceWidth: 1280, deviceHeight: 800 },
    });
  }
}

function fakeTab(cdp: FakeCdp): BrowserTab {
  const frame = {};
  const page = {
    isClosed: () => false,
    on: () => page,
    off: () => page,
    bringToFront: async () => {},
    title: async () => "Sign in",
    url: () => "https://site.test/login",
    mainFrame: () => frame,
    viewportSize: () => ({ width: 1280, height: 800 }),
    setViewportSize: async () => {},
  };
  return {
    page,
    context: { newCDPSession: async () => cdp, pages: () => [page] },
    generation: 0,
    layout: "desktop",
    onPageChange: new Set(),
  } as unknown as BrowserTab;
}

const server = createRuntimeServer();
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
afterAll(() => {
  server.closeAllConnections();
  server.close();
});

let chats = 0;
function handOver(owner?: string) {
  chats += 1;
  const conversationId = `chat-${chats}`;
  const cdp = new FakeCdp();
  const session = sharedHandoffs.open({
    conversationId,
    text: "Sign in",
    tab: fakeTab(cdp),
    limitMs: 60_000,
    ...(owner ? { owner } : {}),
  });
  return { conversationId, cdp, session };
}

function acting(sub: string): Record<string, string> {
  const payload = Buffer.from(JSON.stringify({ sub })).toString("base64url");
  return { "x-houston-acting-as": `acting-v1.${payload}.sig` };
}

const live = (cid: string, query = "viewer=viewer-0001", headers = {}) =>
  fetch(`${base}/conversations/${cid}/browser/live?${query}`, { headers });

const input = (cid: string, body: unknown, headers = {}) =>
  fetch(`${base}/conversations/${cid}/browser/input`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

function events(response: Response) {
  const seen: BrowserLiveEvent[] = [];
  let ended = false;
  const done = (async () => {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const chunk = await reader?.read();
      if (!chunk || chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";
      for (const block of blocks)
        for (const line of block.split("\n"))
          if (line.startsWith("data: ")) seen.push(JSON.parse(line.slice(6)));
    }
    ended = true;
  })();
  const until = async (probe: () => boolean) => {
    for (let i = 0; i < 200 && !probe(); i += 1)
      await new Promise((r) => setTimeout(r, 10));
    if (!probe()) throw new Error(`timed out; saw ${JSON.stringify(seen)}`);
  };
  return { seen, done, until, isEnded: () => ended };
}

const frames = (seen: BrowserLiveEvent[]) =>
  seen.flatMap((e) => (e.type === "frame" ? [e.jpeg] : []));

test("a viewer gets the status, the page, then frames, a window ahead of its acks", async () => {
  const { conversationId, cdp, session } = handOver();
  const stream = events(await live(conversationId));
  await stream.until(() => cdp.sent.includes("Page.startScreencast"));
  const painted = Array.from(
    { length: BROWSER_LIVE_FRAME_WINDOW + 2 },
    (_, i) => `F${i + 1}`,
  );
  for (const jpeg of painted) cdp.paint(jpeg);
  await stream.until(
    () => frames(stream.seen).length === BROWSER_LIVE_FRAME_WINDOW,
  );
  expect(stream.seen.map((e) => e.type)).toEqual([
    "status",
    "page",
    ...Array(BROWSER_LIVE_FRAME_WINDOW).fill("frame"),
  ]);
  expect(stream.seen[1]).toEqual({
    type: "page",
    url: "https://site.test/login",
    title: "Sign in",
  });
  const answer = await input(conversationId, {
    handoff: session.handoffId,
    ack: { viewer: "viewer-0001", seq: BROWSER_LIVE_FRAME_WINDOW },
  });
  expect(await answer.json()).toEqual({ state: "waiting" });
  await stream.until(
    () => frames(stream.seen).length === BROWSER_LIVE_FRAME_WINDOW + 1,
  );
  expect(frames(stream.seen)).toEqual([
    ...painted.slice(0, BROWSER_LIVE_FRAME_WINDOW),
    painted.at(-1),
  ]);
  session.finish("cancelled");
  await stream.done;
  expect(stream.seen.at(-1)).toMatchObject({ state: "cancelled" });
});

test("finishing ends the hand-off; later input is refused and a late viewer sees how it ended", async () => {
  const { conversationId, session } = handOver();
  const finished = await input(conversationId, {
    handoff: session.handoffId,
    finish: "done",
  });
  expect(await finished.json()).toEqual({ state: "done" });
  expect(await session.ended).toBe("done");
  const late = await input(conversationId, {
    handoff: session.handoffId,
    events: [{ type: "back" }],
  });
  expect(late.status).toBe(409);
  expect(await late.json()).toEqual({
    error: "handoff_ended",
    code: "handoff_ended",
    state: "done",
  });
  const stream = events(await live(conversationId));
  await stream.done;
  expect(stream.seen).toEqual([
    {
      type: "status",
      handoffId: session.handoffId,
      state: "done",
      text: "Sign in",
      expiresAt: session.expiresAt,
      window: {
        frames: BROWSER_LIVE_FRAME_WINDOW,
        bytes: BROWSER_LIVE_FRAME_WINDOW_BYTES,
      },
    },
  ]);
});

test("no hand-off is a 404; a bad viewer or body is a 400", async () => {
  expect((await live("nobody")).status).toBe(404);
  expect(await (await input("nobody", {})).json()).toMatchObject({
    code: "no_handoff",
  });
  const { conversationId, session } = handOver();
  for (const query of ["viewer=short", "", "viewer=viewer-0001&layout=tv"])
    expect((await live(conversationId, query)).status).toBe(400);
  const bad = await input(conversationId, {
    handoff: session.handoffId,
    events: [{ type: "teleport" }],
  });
  expect(bad.status).toBe(400);
  expect(await bad.json()).toMatchObject({ code: "invalid_input" });
  session.finish("cancelled");
});

test("only the person the browser was handed to may watch or drive it", async () => {
  const { conversationId, session } = handOver("member-owner");
  for (const headers of [acting("member-other"), {}]) {
    const watched = await live(conversationId, undefined, headers);
    expect(watched.status).toBe(403);
    expect(await watched.json()).toMatchObject({ code: "not_handoff_owner" });
    expect((await input(conversationId, {}, headers)).status).toBe(403);
  }
  const owned = await input(
    conversationId,
    { handoff: session.handoffId, finish: "cancel" },
    acting("member-owner"),
  );
  expect(await owned.json()).toEqual({ state: "cancelled" });
  expect(session.state).toBe("cancelled");
});
