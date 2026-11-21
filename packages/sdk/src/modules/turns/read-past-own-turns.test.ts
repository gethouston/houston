import {
  type ChatMessage,
  EngineError,
  type EventStreamOptions,
  type HoustonEngineClient,
  type WireFrame,
} from "@houston/runtime-client";
import { afterEach, expect, test } from "vitest";
import { createAuthExpiryNotifier } from "../../auth-expiry";
import type { ModuleContext } from "../../module-context";
import type { SdkConfig } from "../../ports";
import { ScopeStore } from "../../store";
import type { FeedOutput } from "./feed-output";
import { createTurnsModule } from "./index";
import { readPastOwnTurns } from "./read-past-own-turns";
import { type Flight, joinInFlight } from "./single-flight";
import { StreamRegistry, streamKey } from "./stream-registry";
import { streamTurn } from "./turn-stream";
import { type ConversationVM, conversationScope } from "./vm-output";

const registry = new StreamRegistry();
afterEach(() => registry.disposeAll());

const engine = {
  streamEvents: (_id: string, opts: EventStreamOptions) =>
    new Promise<void>((resolve) => {
      if (opts.signal?.aborted) return resolve();
      opts.signal?.addEventListener("abort", () => resolve(), { once: true });
    }),
  sendMessage: async () => ({ ok: true }),
  getHistory: async () => ({ id: "c", title: "", messages: [] }),
} as unknown as HoustonEngineClient;

const silent: FeedOutput = {
  pushFeedItem: () => {},
  sessionStatus: () => {},
  persistBoardStatus: async () => {},
};

const deferred = <T>() => {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

test("a turn is counted on its conversation before its bubble is pushed", () => {
  const key = streamKey("agent", "chat");
  const countAtBubble: number[] = [];
  const output: FeedOutput = {
    ...silent,
    pushFeedItem: (_a, _s, item) => {
      if ((item as { feed_type?: string }).feed_type === "user_message")
        countAtBubble.push(registry.turnsStarted(key));
    },
  };

  expect(registry.turnsStarted(key)).toBe(0);
  void streamTurn(engine, "agent", "chat", "first", output, registry);
  void streamTurn(engine, "agent", "chat", "second", output, registry);

  expect(countAtBubble).toEqual([1, 2]);
  expect(registry.turnsStarted(key)).toBe(2);
  expect(registry.turnsStarted(streamKey("agent", "other"))).toBe(0);
});

const letGo = (key: string) => {
  const entry = registry.get(key);
  if (entry) registry.release(key, entry);
};
const tick = () => new Promise((r) => setTimeout(r, 10));

test("a read a send overtook is read again once that turn let go", async () => {
  const key = streamKey("agent", "fresh-chat");
  const first = deferred<string>();
  const answers = [first.promise, Promise.resolve("after the turn")];
  let reads = 0;
  const read = readPastOwnTurns(registry, key, () => answers[reads++]);

  void streamTurn(engine, "agent", "fresh-chat", "hi", silent, registry);
  first.resolve("before the turn");
  await tick();
  expect(reads).toBe(1);

  letGo(key);
  await expect(read).resolves.toEqual({ value: "after the turn", mark: 1 });
  expect(reads).toBe(2);
});

test("a read sent before the engine took the send is overtaken too", async () => {
  const key = streamKey("agent", "held-chat");
  void streamTurn(engine, "agent", "held-chat", "hi", silent, registry);
  let reads = 0;
  const read = readPastOwnTurns(registry, key, async () => ++reads);
  await tick();
  expect(reads).toBe(1);

  letGo(key);
  await expect(read).resolves.toEqual({ value: 2, mark: 1 });
});

test("a read sent after the engine took the send is trusted", async () => {
  const key = streamKey("agent", "taken-chat");
  void streamTurn(engine, "agent", "taken-chat", "hi", silent, registry);
  await tick();
  let reads = 0;
  const read = await readPastOwnTurns(registry, key, async () => ++reads);
  expect(read).toEqual({ value: 1, mark: 1 });
  expect(registry.ownsTurn(key)).toBe(true);
});

test("an overtaken read the host answers not-found reads again after the turn", async () => {
  const key = streamKey("agent", "new-chat");
  void streamTurn(engine, "agent", "new-chat", "hi", silent, registry);
  let reads = 0;
  const read = readPastOwnTurns(registry, key, async () => {
    reads++;
    if (reads === 1) throw new EngineError(404, "not found");
    return "the chat";
  });
  await tick();
  expect(reads).toBe(1);

  letGo(key);
  await expect(read).resolves.toEqual({ value: "the chat", mark: 1 });
});

test("a not-found read nothing overtook is the answer", async () => {
  const key = streamKey("agent", "missing-chat");
  const read = readPastOwnTurns(registry, key, async () => {
    throw new EngineError(404, "not found");
  });
  await expect(read).rejects.toMatchObject({ status: 404 });
});

test("a read reads again for as long as sends keep overtaking it", async () => {
  const key = streamKey("agent", "busy-chat");
  let reads = 0;
  const { value, mark } = await readPastOwnTurns(registry, key, async () => {
    reads++;
    if (reads <= 3) registry.noteTurnStart(key);
    return reads;
  });
  expect(value).toBe(4);
  expect(mark).toBe(registry.turnsStarted(key));
});

test("a refused handoff send lets a waiting read go", async () => {
  const key = streamKey("agent", "handoff-chat");
  registry.beginSend(key);
  let reads = 0;
  const read = readPastOwnTurns(registry, key, async () => ++reads);
  await tick();
  expect(reads).toBe(1);

  registry.endSend(key);
  await expect(read).resolves.toEqual({ value: 2, mark: 0 });
});

test("a teardown ends the wait without reading on a gone client", async () => {
  const key = streamKey("agent", "gone-chat");
  void streamTurn(engine, "agent", "gone-chat", "hi", silent, registry);
  let reads = 0;
  const read = readPastOwnTurns(registry, key, async () => ++reads);
  await tick();

  registry.disposeAll();
  await expect(read).resolves.toEqual({ value: 1, mark: null });
  expect(reads).toBe(1);
});

test("observe seeds the read taken past a send, never the one it overtook", async () => {
  const store = new ScopeStore();
  const first = deferred<ChatMessage[]>();
  const settled: ChatMessage[] = [
    { role: "user", content: "earlier", ts: 1, turnId: "t0" },
    { role: "assistant", content: "answer", ts: 2, turnId: "t0" },
    { role: "user", content: "hi", ts: 3, turnId: "t1" },
    { role: "assistant", content: "hi there", ts: 4, turnId: "t1" },
  ];
  let reads = 0;
  const client = {
    async streamEvents(_id: string, o: { onEvent: (f: WireFrame) => void }) {
      o.onEvent({
        type: "sync",
        data: { running: false, partial: "", seq: 0 },
      });
      o.onEvent({ type: "text", data: "hi there", turnId: "t1", seq: 1 });
      o.onEvent({ type: "done", data: null, turnId: "t1", seq: 2 });
    },
    async sendMessage() {},
    async getHistory() {
      reads++;
      const messages = reads === 1 ? await first.promise : settled;
      return { id: "c1", title: "", messages };
    },
  } as unknown as HoustonEngineClient;
  const logger = { debug() {}, info() {}, warn() {}, error() {} };
  const ctx: ModuleContext = {
    config: {
      baseUrl: "http://x",
      ports: { logger } as unknown as SdkConfig["ports"],
      reactivity: false,
    },
    store,
    clientFor: () => client,
    authExpiry: createAuthExpiryNotifier(store),
    registerCommand: () => {},
  };
  const mod = createTurnsModule(ctx, async () => {});
  const vm = () =>
    store.getSnapshot(conversationScope("", "c1")) as ConversationVM;

  const observing = mod.observe("c1", "");
  await mod.send({ conversationId: "c1", text: "hi" });
  first.resolve([]);
  await observing;

  expect(reads).toBeGreaterThanOrEqual(2);
  expect(vm().feed.map((f) => f.data)).toEqual(
    expect.arrayContaining(["earlier", "answer", "hi", "hi there"]),
  );
});

test("observe calls on one chat share a read, and a join reads once more", async () => {
  const store = new ScopeStore();
  const answers = [deferred<ChatMessage[]>(), deferred<ChatMessage[]>()];
  let reads = 0;
  const client = {
    async streamEvents(_id: string, o: { onEvent: (f: WireFrame) => void }) {
      o.onEvent({
        type: "sync",
        data: { running: false, partial: "", seq: 0 },
      });
    },
    async getHistory() {
      const answer = answers[reads++] ?? deferred<ChatMessage[]>();
      return { id: "c1", title: "", messages: await answer.promise };
    },
  } as unknown as HoustonEngineClient;
  const logger = { debug() {}, info() {}, warn() {}, error() {} };
  const mod = createTurnsModule(
    {
      config: {
        baseUrl: "http://x",
        ports: { logger } as unknown as SdkConfig["ports"],
        reactivity: false,
      },
      store,
      clientFor: () => client,
      authExpiry: createAuthExpiryNotifier(store),
      registerCommand: () => {},
    },
    async () => {},
  );

  const first = mod.observe("c1", "");
  const second = mod.observe("c1", "");
  const third = mod.observe("c1", "");
  answers[0].resolve([]);
  await tick();
  expect(reads).toBe(2);
  answers[1].resolve([{ role: "user", content: "later", ts: 1 }]);
  await Promise.all([first, second, third]);
  expect(reads).toBe(2);
  expect(
    (store.getSnapshot(conversationScope("", "c1")) as ConversationVM).feed.map(
      (f) => f.data,
    ),
  ).toContain("later");
});

test("a call nobody joined runs once", async () => {
  let reads = 0;
  const inFlight = new Map<string, Flight<number>>();
  await expect(joinInFlight(inFlight, "k", async () => ++reads)).resolves.toBe(
    1,
  );
  expect(reads).toBe(1);
  expect(inFlight.size).toBe(0);
});
