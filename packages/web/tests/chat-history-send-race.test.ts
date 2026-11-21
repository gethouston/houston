import { HoustonClient } from "@houston/engine-adapter/client";
import { conversationStore } from "@houston/engine-adapter/vm";
import type { ChatMessage } from "@houston/runtime-client";
import { conversationScope } from "@houston/sdk";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { installLocalStorage, json } from "./support/wire-capture";

const BASE = "http://host";
const AGENT = "a1";
const GOAL = "<!--houston:onboarding-goal {}-->";
const REPLY = "On it.";

const usage = { context_tokens: 1200, output_tokens: 80, cached_tokens: 0 };
const earlier: ChatMessage[] = [
  { role: "user", content: "earlier question", ts: 1, turnId: "t0" },
  { role: "assistant", content: "earlier answer", ts: 2, turnId: "t0", usage },
];
const withTurn: ChatMessage[] = [
  ...earlier,
  { role: "user", content: "hidden", displayText: GOAL, ts: 3, turnId: "t1" },
  { role: "assistant", content: REPLY, ts: 4, turnId: "t1", usage },
];

let seq = 0;
let sk: string;
let historyReads: number;
let answerFirstRead: (messages: ChatMessage[]) => void;
let finishTurn: () => void;
let refuseSends: () => void;
let holdSends: () => () => void;

const chunk = (frames: object[]) =>
  new TextEncoder().encode(
    frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join(""),
  );

const sse = (sent: Promise<string>, done: Promise<void>) =>
  new Response(
    new ReadableStream({
      async start(controller) {
        controller.enqueue(
          chunk([
            { type: "sync", data: { running: false, partial: "", seq: 0 } },
          ]),
        );
        const nonce = await sent;
        controller.enqueue(
          chunk([
            {
              type: "user",
              data: { content: "hidden", ts: 3, nonce },
              turnId: "t1",
              seq: 1,
            },
            { type: "text", data: REPLY, turnId: "t1", seq: 2 },
          ]),
        );
        await done;
        controller.enqueue(
          chunk([{ type: "done", data: null, turnId: "t1", seq: 3 }]),
        );
        controller.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );

const deferred = <T>() => {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

beforeEach(() => {
  installLocalStorage();
  sk = `send-race-${seq++}`;
  historyReads = 0;
  const firstRead = deferred<ChatMessage[]>();
  answerFirstRead = firstRead.resolve;
  const sent = deferred<string>();
  const done = deferred<void>();
  finishTurn = () => done.resolve();
  let refusing = false;
  refuseSends = () => {
    refusing = true;
  };
  let accepted: Promise<void> = Promise.resolve();
  holdSends = () => {
    const gate = deferred<void>();
    accepted = gate.promise;
    return () => gate.resolve();
  };
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/messages?")) {
      historyReads++;
      const messages = historyReads === 1 ? await firstRead.promise : withTurn;
      return json(200, { id: sk, title: "", messages });
    }
    if (init?.method === "POST" && url.endsWith("/messages")) {
      if (refusing) return json(400, { error: "message too long" });
      await accepted;
      sent.resolve((JSON.parse(String(init.body)) as { nonce: string }).nonce);
      return json(202, { ok: true, id: sk, turnId: "t1" });
    }
    if (url.endsWith("/import")) return json(200, { ok: true, imported: 2 });
    if (url.endsWith("/events")) return sse(sent.promise, done.promise);
    return json(200, { ok: true, items: [] });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const client = () =>
  new HoustonClient({ baseUrl: BASE, token: "t", controlPlane: true });

function vm() {
  return conversationStore.getSnapshot(conversationScope(AGENT, sk)) as
    | {
        running: boolean;
        feed: { feed_type: string; data: unknown }[];
        historyWindow?: { earliestLoaded: number; total: number };
      }
    | undefined;
}
const feed = () =>
  (vm()?.feed ?? [])
    .filter((f) => f.feed_type !== "final_result")
    .map((f) => [f.feed_type, f.data]);
const whole = [
  ["user_message", "earlier question"],
  ["assistant_text", "earlier answer"],
  ["user_message", GOAL],
  ["assistant_text", REPLY],
];

const send = (c: HoustonClient) =>
  c.startSession(AGENT, {
    sessionKey: sk,
    prompt: "hidden",
    displayText: GOAL,
  });
const replied = () => vi.waitUntil(() => feed().some(([, d]) => d === REPLY));
const settled = () => vi.waitUntil(() => vm()?.running === false);

test("an open read a send overtook reads again once the turn settles", async () => {
  const c = client();
  const open = c.loadChatHistory(AGENT, sk);
  await vi.waitUntil(() => historyReads === 1);
  await send(c);
  await replied();

  answerFirstRead(earlier);
  await new Promise((r) => setTimeout(r, 20));
  expect(historyReads).toBe(1);
  finishTurn();
  await open;

  expect(historyReads).toBe(2);
  expect(feed()).toEqual(whole);
  expect(vm()?.historyWindow).toEqual({ earliestLoaded: 0, total: 4 });
});

test("an open read answered after the turn settled reads again at once", async () => {
  const c = client();
  const open = c.loadChatHistory(AGENT, sk);
  await vi.waitUntil(() => historyReads === 1);
  await send(c);
  finishTurn();
  await settled();

  answerFirstRead(earlier);
  await open;

  expect(historyReads).toBe(2);
  expect(feed()).toEqual(whole);
});

test("a read sent before the host took the send waits the turn out", async () => {
  const accept = holdSends();
  const c = client();
  void send(c);
  const open = c.loadChatHistory(AGENT, sk);
  await vi.waitUntil(() => historyReads === 1);
  answerFirstRead(earlier);
  accept();
  await replied();
  expect(historyReads).toBe(1);
  finishTurn();
  await open;

  expect(historyReads).toBe(2);
  expect(feed()).toEqual(whole);
});

test("after a refused send, the next read is the server's transcript", async () => {
  refuseSends();
  const c = client();
  await send(c);
  await settled();

  const open = c.loadChatHistory(AGENT, sk);
  await vi.waitUntil(() => historyReads === 1);
  answerFirstRead(earlier);
  await open;

  expect(historyReads).toBe(1);
  expect(feed()).toEqual([
    ["user_message", "earlier question"],
    ["assistant_text", "earlier answer"],
  ]);
});

test("an import's reseed never waits out a send that starts during it", async () => {
  const c = client();
  const imported = c.importConversationMessages(AGENT, sk, {
    importId: "onboarding:first_run",
    messages: [{ role: "assistant", content: "Hi there!" }],
  });
  await vi.waitUntil(() => historyReads === 1);
  await send(c);
  await replied();
  answerFirstRead(earlier);

  await expect(imported).resolves.toEqual({ ok: true, imported: 2 });
  expect(historyReads).toBe(1);
  expect(feed()).not.toContainEqual(["user_message", "earlier question"]);
  finishTurn();
});
