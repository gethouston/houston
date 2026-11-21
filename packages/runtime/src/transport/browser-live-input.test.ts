import type { AddressInfo } from "node:net";
import { afterAll, expect, test } from "vitest";
import {
  FakeCdp,
  fakeTab,
} from "../session/tools/browser/live/live.test-support";
import { sharedHandoffs } from "../session/tools/browser/live/registry";
import { createRuntimeServer } from "./server";

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
  const conversationId = `input-chat-${chats}`;
  const cdp = new FakeCdp();
  const { tab } = fakeTab(undefined, () => cdp);
  const session = sharedHandoffs.open({
    conversationId,
    text: "Sign in",
    tab,
    limitMs: 60_000,
    ...(owner ? { owner } : {}),
  });
  return { conversationId, cdp, session };
}

function acting(sub: string): Record<string, string> {
  const payload = Buffer.from(JSON.stringify({ sub })).toString("base64url");
  return { "x-houston-acting-as": `acting-v1.${payload}.sig` };
}

const input = (cid: string, body: unknown, headers = {}) =>
  fetch(`${base}/conversations/${cid}/browser/input`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const typed = (value: string) => [{ type: "text", text: value }];
const viewer = "viewer-0001";

test("a hand-off started for nobody in particular refuses a signed person", async () => {
  const { conversationId, session } = handOver();
  const signed = await input(conversationId, {}, acting("member-x"));
  expect(signed.status).toBe(403);
  expect(await signed.json()).toMatchObject({ code: "not_handoff_owner" });
  const live = await fetch(
    `${base}/conversations/${conversationId}/browser/live?viewer=${viewer}`,
    { headers: acting("member-x") },
  );
  expect(live.status).toBe(403);
  expect(await (await input(conversationId, {})).json()).toEqual({
    state: "waiting",
  });
  session.finish("cancelled");
});

test("a retried batch answers the current state without typing twice", async () => {
  const { conversationId, cdp, session } = handOver();
  const batch = { viewer, seq: 1 };
  for (let i = 0; i < 2; i += 1)
    expect(
      await (
        await input(conversationId, {
          handoff: session.handoffId,
          events: typed("a"),
          batch,
        })
      ).json(),
    ).toEqual({ state: "waiting" });
  await input(conversationId, {
    handoff: session.handoffId,
    events: typed("b"),
    batch: { viewer, seq: 2 },
  });
  expect(cdp.sent).toEqual(["Input.insertText:a", "Input.insertText:b"]);
  const last = await input(conversationId, {
    handoff: session.handoffId,
    events: typed("b"),
    batch: { viewer, seq: 2 },
    finish: "done",
  });
  expect(await last.json()).toEqual({ state: "done" });
  expect(cdp.sent).toHaveLength(2);
  expect(session.state).toBe("done");
});

test("a navigate the policy refuses is named in the answer; the rest of the batch runs", async () => {
  const { conversationId, cdp, session } = handOver();
  const answer = await input(conversationId, {
    handoff: session.handoffId,
    events: [
      { type: "navigate", url: "file:///etc/passwd" },
      { type: "text", text: "after" },
    ],
  });
  expect(await answer.json()).toEqual({
    state: "waiting",
    refused: "url_refused",
  });
  expect(cdp.sent).toEqual(["Input.insertText:after"]);
  session.finish("cancelled");
});

test("a finish racing a queued batch wins: the batch applies nothing and answers the end", async () => {
  const { conversationId, cdp, session } = handOver();
  const release = cdp.hold("Input.insertText");
  const running = input(conversationId, {
    handoff: session.handoffId,
    events: typed("a"),
  });
  await sleep(50);
  const queued = input(conversationId, {
    handoff: session.handoffId,
    events: typed("queued"),
  });
  await sleep(50);
  const finished = await input(conversationId, {
    handoff: session.handoffId,
    finish: "done",
  });
  expect(await finished.json()).toEqual({ state: "done" });
  release();
  expect(await (await running).json()).toEqual({ state: "done" });
  expect(await (await queued).json()).toEqual({ state: "done" });
  expect(cdp.sent).toEqual(["Input.insertText:a"]);
});

test("a finish that names no hand-off is refused and finishes nothing", async () => {
  const { conversationId, session } = handOver();
  const unnamed = await input(conversationId, { finish: "done" });
  expect(unnamed.status).toBe(400);
  expect(await unnamed.json()).toMatchObject({ code: "invalid_input" });
  expect(session.state).toBe("waiting");
  session.finish("cancelled");
});
