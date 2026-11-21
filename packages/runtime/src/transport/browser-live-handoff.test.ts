import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, expect, test } from "vitest";
import {
  FakeCdp,
  fakeTab,
} from "../session/tools/browser/live/live.test-support";
import { HandoffRegistry } from "../session/tools/browser/live/registry";
import { serveBrowserInput, serveBrowserLive } from "./browser-live-http";

const registry = new HandoffRegistry(60_000);
const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://runtime");
  const match = url.pathname.match(/^\/c\/([^/]+)\/(live|input)$/);
  if (!match) return void res.writeHead(404).end();
  if (match[2] === "live")
    return serveBrowserLive(req, res, match[1], url, registry);
  serveBrowserInput(req, res, match[1], registry).catch((err: unknown) => {
    res.writeHead(500).end(String(err));
  });
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
afterAll(() => {
  server.closeAllConnections();
  server.close();
});

function handOver(conversationId: string) {
  const cdp = new FakeCdp();
  const { tab } = fakeTab(undefined, () => cdp);
  const session = registry.open({
    conversationId,
    text: "Sign in",
    tab,
    limitMs: 60_000,
  });
  return { cdp, session };
}

const input = (cid: string, body: unknown) =>
  fetch(`${base}/c/${cid}/input`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const live = (cid: string, query: string) =>
  fetch(`${base}/c/${cid}/live?viewer=viewer-0001&${query}`);
const typed = (value: string) => [{ type: "text", text: value }];

test("the first hand-off's finish, batch, ack and stream never reach the second", async () => {
  const first = handOver("chat-a");
  const old = first.session.handoffId;
  first.session.finish("done");
  const next = handOver("chat-a");
  expect(next.session.handoffId).not.toBe(old);

  const lateFinish = await input("chat-a", { handoff: old, finish: "done" });
  expect(lateFinish.status).toBe(409);
  expect(await lateFinish.json()).toEqual({
    error: "handoff_ended",
    code: "handoff_ended",
    state: "done",
  });
  const lateBatch = await input("chat-a", {
    handoff: old,
    events: typed("late"),
    batch: { viewer: "viewer-0001", seq: 9 },
  });
  expect(lateBatch.status).toBe(409);
  const lateAck = await input("chat-a", {
    handoff: old,
    ack: { viewer: "viewer-0001", seq: 3 },
  });
  expect(lateAck.status).toBe(409);
  const reconnect = await live("chat-a", `handoff=${old}`);
  expect(reconnect.status).toBe(200);
  const body = await reconnect.text();
  expect(body).toContain(`"handoffId":"${old}"`);
  expect(body).toContain('"state":"done"');
  expect(next.session.state).toBe("waiting");
  expect(next.cdp.sent).toEqual([]);

  const own = await input("chat-a", {
    handoff: next.session.handoffId,
    events: typed("b"),
    batch: { viewer: "viewer-0001", seq: 1 },
    finish: "done",
  });
  expect(await own.json()).toEqual({ state: "done" });
  expect(next.cdp.sent).toEqual(["Input.insertText:b"]);
});

test("a hand-off id no longer known is over while the chat has a newer one, else there is none", async () => {
  const { session } = handOver("chat-b");
  const unknown = "0b6c3f9e-8d1a-4f2b-9c3d-5e6f7a8b9c0d";
  const stale = await input("chat-b", { handoff: unknown, finish: "cancel" });
  expect(stale.status).toBe(409);
  expect(await stale.json()).toEqual({
    error: "handoff_ended",
    code: "handoff_ended",
  });
  expect((await live("chat-b", `handoff=${unknown}`)).status).toBe(409);
  expect((await live("chat-b", "handoff=bad id")).status).toBe(400);
  expect((await live("chat-none", `handoff=${unknown}`)).status).toBe(404);
  expect(session.state).toBe("waiting");
  const other = handOver("chat-c");
  const crossed = await input("chat-b", {
    handoff: other.session.handoffId,
    finish: "done",
  });
  expect(crossed.status).toBe(409);
  expect(session.state).toBe("waiting");
  session.finish("cancelled");
  other.session.finish("cancelled");
});

test("a reconnect naming the current hand-off is served live", async () => {
  const { session } = handOver("chat-d");
  const controller = new AbortController();
  const stream = await fetch(
    `${base}/c/chat-d/live?viewer=viewer-0001&handoff=${session.handoffId}`,
    { signal: controller.signal },
  );
  expect(stream.status).toBe(200);
  const reader = stream.body?.getReader();
  const first = new TextDecoder().decode((await reader?.read())?.value);
  expect(first).toContain(`"handoffId":"${session.handoffId}"`);
  expect(first).toContain('"state":"waiting"');
  controller.abort();
  session.finish("cancelled");
});
