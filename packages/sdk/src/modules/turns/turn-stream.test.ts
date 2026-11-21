import { AUTO_CONTINUE_MARKER } from "@houston/protocol";
import type {
  ChatMessage,
  EventStreamOptions,
  HoustonEngineClient,
  PendingInteraction,
  WireFrame,
} from "@houston/runtime-client";
import { EngineError } from "@houston/runtime-client";
import { afterEach, expect, test } from "vitest";
import { ScopeStore } from "../../store";
import type { FeedOutput } from "./feed-output";
import { historyToFeed } from "./history";
import { TURN_DIED_MESSAGE } from "./settle-from-history";
import {
  SEND_IN_FLIGHT_MESSAGE,
  SEND_LOST_MESSAGE,
  STREAM_LOST_MESSAGE,
  StreamRegistry,
  streamKey,
} from "./stream-registry";
import { TurnSink } from "./turn-sink";
import {
  observeConversation,
  type StreamTuning,
  streamTurn,
} from "./turn-stream";
import {
  type ConversationVM,
  ConversationVmOutput,
  conversationScope,
} from "./vm-output";

type StreamHandler = (opts: EventStreamOptions) => void | Promise<void>;

const hang: StreamHandler = (opts) =>
  new Promise<void>((resolve) => {
    if (opts.signal?.aborted) return resolve();
    opts.signal?.addEventListener("abort", () => resolve(), { once: true });
  });

function fakeEngine(
  handlers: StreamHandler[],
  history: ChatMessage[] = [],
  opts: { sendError?: unknown; sendErrors?: unknown[] } = {},
) {
  const afters: Array<number | undefined> = [];
  const nonces: Array<string | undefined> = [];
  const sendOpts: Array<Record<string, unknown> | undefined> = [];
  const texts: string[] = [];
  const historyCalls = { n: 0 };
  const engine = {
    async streamEvents(_id: string, streamOpts: EventStreamOptions) {
      const h = handlers[Math.min(afters.length, handlers.length - 1)];
      afters.push(streamOpts.after);
      await h?.(streamOpts);
    },
    async sendMessage(
      _id: string,
      text: string,
      messageOpts?: { nonce?: string },
    ) {
      texts.push(text);
      nonces.push(messageOpts?.nonce);
      sendOpts.push(messageOpts as Record<string, unknown> | undefined);
      if (opts.sendError !== undefined) throw opts.sendError;
      if (opts.sendErrors?.length) throw opts.sendErrors.shift();
    },
    async getHistory() {
      historyCalls.n++;
      return { id: "c", title: "", messages: history };
    },
  } as unknown as HoustonEngineClient;
  return { engine, afters, nonces, sendOpts, texts, historyCalls };
}

const registry = new StreamRegistry();
afterEach(() => registry.disposeAll());

type Item = {
  feed_type?: string;
  data?: unknown;
  notice?: string;
  pending?: boolean;
  fails_pending?: boolean;
  author?: { userId: string; name?: string };
  mentions?: { userId: string; name?: string }[];
};

function makeOutput() {
  const items: Item[] = [];
  const sessionStatuses: string[] = [];
  const board: string[] = [];
  const boardInteractions: Array<PendingInteraction | null | undefined> = [];
  const idleConfirms: string[] = [];
  const output: FeedOutput = {
    pushFeedItem: (_a, _s, item) => {
      items.push(item as Item);
    },
    sessionStatus: (_a, _s, status) => {
      sessionStatuses.push(status);
    },
    persistBoardStatus: async (_a, _s, status, pendingInteraction) => {
      board.push(status);
      boardInteractions.push(pendingInteraction);
    },
    confirmIdle: (_a, s) => {
      idleConfirms.push(s);
    },
  };
  return {
    items,
    sessionStatuses,
    board,
    boardInteractions,
    idleConfirms,
    output,
  };
}

async function waitFor(cond: () => boolean, ms = 2_000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
}

const fast: StreamTuning = {
  idleTimeoutMs: 2_000,
  backoff: { initialMs: 1, maxMs: 2, jitter: () => 0 },
};
const sync = (
  running: boolean,
  partial: string,
  seq: number,
  extra?: { turnId?: string; resync?: boolean },
): WireFrame => ({
  type: "sync",
  data: { running, partial, seq, ...extra },
  seq,
});
const finals = (items: Item[]) =>
  items.filter((i) => i.feed_type === "final_result");
const turnRunningRefusal = () =>
  new EngineError(409, JSON.stringify({ error: "turn running" }));

test("a silent stream close mid-turn reconnects with the cursor and settles on the real done", async () => {
  const { engine, afters } = fakeEngine([
    (o) => {
      o.onEvent(sync(false, "", 0));
      o.onEvent({ type: "text", data: "Hel", seq: 1 });
    },
    (o) => {
      o.onEvent({ type: "text", data: "lo", seq: 2 });
      o.onEvent({ type: "done", data: null, seq: 3 });
    },
  ]);
  const { items, board, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-resume",
    "hi",
    output,
    registry,
    {
      tuning: fast,
    },
  );

  expect(afters).toEqual([undefined, 1]);
  const texts = items.filter((i) => i.feed_type === "assistant_text");
  expect(texts).toEqual([{ feed_type: "assistant_text", data: "Hello" }]);
  expect(finals(items)).toHaveLength(1);
  expect(
    (finals(items)[0]?.data as { result?: string } | undefined)?.result,
  ).toBe("Hello");
  expect(board).toEqual(["running", "needs_you"]);
});

test("a clean done carrying a pending interaction settles needs_you and persists the interaction", async () => {
  const interaction: PendingInteraction = {
    steps: [
      {
        kind: "question",
        id: "q1",
        question: "Which flight?",
        options: [{ id: "m", label: "Morning" }],
      },
    ],
  };
  const { engine } = fakeEngine([
    (o) => {
      o.onEvent(sync(false, "", 0));
      o.onEvent({ type: "text", data: "Options:", seq: 1 });
      o.onEvent({
        type: "done",
        data: null,
        pendingInteraction: interaction,
        seq: 2,
      });
    },
  ]);
  const { board, boardInteractions, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-ask",
    "hi",
    output,
    registry,
    { tuning: fast },
  );

  expect(board).toEqual(["running", "needs_you"]);
  expect(boardInteractions).toEqual([null, interaction]);
});

test("a resync after the turn ended settles from refreshed history, not partial text", async () => {
  const history: ChatMessage[] = [
    { role: "user", content: "hi", ts: 1 },
    {
      role: "assistant",
      content: "Hello world",
      ts: 2,
      usage: { context_tokens: 42, output_tokens: 7, cached_tokens: 0 },
    },
  ];
  const { engine, afters } = fakeEngine(
    [
      (o) => {
        o.onEvent(sync(true, "", 0));
        o.onEvent({ type: "text", data: "Hel", seq: 1 });
      },
      (o) => {
        o.onEvent({
          type: "sync",
          data: { running: false, partial: "", seq: 9, resync: true },
          seq: 9,
        });
      },
      hang,
    ],
    history,
  );
  const { items, board, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-resync",
    "hi",
    output,
    registry,
    {
      tuning: fast,
    },
  );

  expect(afters.slice(0, 2)).toEqual([undefined, 1]);
  const texts = items.filter((i) => i.feed_type === "assistant_text");
  expect(texts).toEqual([{ feed_type: "assistant_text", data: "Hello world" }]);
  const final = finals(items)[0]?.data as
    | { result?: string; usage?: { context_tokens?: number } | null }
    | undefined;
  expect(final?.result).toBe("Hello world");
  expect(final?.usage?.context_tokens).toBe(42);
  expect(board).toEqual(["running", "needs_you"]);
});

test("a resync for a turn that died unpersisted settles from the streamed text", async () => {
  const history: ChatMessage[] = [{ role: "user", content: "hi", ts: 1 }];
  const { engine } = fakeEngine(
    [
      (o) => {
        o.onEvent(sync(true, "", 0));
        o.onEvent({ type: "text", data: "Hel", seq: 1 });
      },
      (o) => {
        o.onEvent({
          type: "sync",
          data: { running: false, partial: "", seq: 9, resync: true },
          seq: 9,
        });
      },
      hang,
    ],
    history,
  );
  const { items, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-dead",
    "hi",
    output,
    registry,
    {
      tuning: fast,
    },
  );

  const texts = items.filter((i) => i.feed_type === "assistant_text");
  expect(texts).toEqual([{ feed_type: "assistant_text", data: "Hel" }]);
});

test("the history guard rejects a PREVIOUS turn's reply when ours never persisted", async () => {
  const history: ChatMessage[] = [
    { role: "user", content: "old", ts: 1 },
    { role: "assistant", content: "Old reply", ts: 2 },
  ];
  const { engine } = fakeEngine(
    [
      (o) => {
        o.onEvent(sync(true, "", 0));
        o.onEvent({ type: "text", data: "Hel", seq: 1 });
      },
      (o) => {
        o.onEvent({
          type: "sync",
          data: { running: false, partial: "", seq: 9, resync: true },
          seq: 9,
        });
      },
      hang,
    ],
    history,
  );
  const { items, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-guard",
    "hi",
    output,
    registry,
    {
      tuning: fast,
    },
  );

  const texts = items.filter((i) => i.feed_type === "assistant_text");
  expect(texts).toEqual([{ feed_type: "assistant_text", data: "Hel" }]);
});

test("exactly one user bubble: the optimistic push renders, the engine's echo never does", async () => {
  const { engine } = fakeEngine([
    (o) => {
      o.onEvent(sync(false, "", 0));
      o.onEvent({ type: "user", data: { content: "hi", ts: 1 }, seq: 1 });
      o.onEvent({ type: "text", data: "yo", seq: 2 });
      o.onEvent({ type: "done", data: null, seq: 3 });
    },
  ]);
  const { items, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-echo",
    "hi",
    output,
    registry,
    {
      tuning: fast,
    },
  );

  const bubbles = items.filter((i) => i.feed_type === "user_message");
  expect(bubbles).toHaveLength(1);
  expect(bubbles[0]?.data).toBe("hi");
});

test("the optimistic user bubble is pushed pending (unconfirmed until server evidence)", async () => {
  const { engine } = fakeEngine([
    (o) => {
      o.onEvent(sync(false, "", 0));
      o.onEvent({ type: "text", data: "yo", seq: 1 });
      o.onEvent({ type: "done", data: null, seq: 2 });
    },
  ]);
  const { items, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-pending",
    "hi",
    output,
    registry,
    { tuning: fast },
  );

  const bubble = items.find((i) => i.feed_type === "user_message");
  expect(bubble?.pending).toBe(true);
});

test("suppressUserBubble pushes no optimistic bubble at all (a resend, no clock)", async () => {
  const { engine } = fakeEngine([
    (o) => {
      o.onEvent(sync(false, "", 0));
      o.onEvent({ type: "done", data: null, seq: 1 });
    },
  ]);
  const { items, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-resend",
    "hi",
    output,
    registry,
    { tuning: fast, suppressUserBubble: true },
  );

  expect(items.some((i) => i.feed_type === "user_message")).toBe(false);
});

test("an auto-continue prompt pushes no bubble — the user never wrote it", async () => {
  const { engine } = fakeEngine([
    (o) => {
      o.onEvent(sync(false, "", 0));
      o.onEvent({ type: "done", data: null, seq: 1 });
    },
  ]);
  const { items, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-resume",
    `${AUTO_CONTINUE_MARKER}\n\nkeep going`,
    output,
    registry,
    { tuning: fast },
  );

  expect(items.some((i) => i.feed_type === "user_message")).toBe(false);
});

test("the optimistic bubble carries the sender's author (multiplayer attribution)", async () => {
  const { engine } = fakeEngine([
    (o) => {
      o.onEvent(sync(false, "", 0));
      o.onEvent({ type: "done", data: null, seq: 1 });
    },
  ]);
  const { items, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-shared",
    "hi team",
    output,
    registry,
    { tuning: fast, author: { userId: "user_a", name: "Ada" } },
  );

  const bubble = items.find((i) => i.feed_type === "user_message");
  expect(bubble?.author).toEqual({ userId: "user_a", name: "Ada" });
});

test("the optimistic bubble stays authorless when no sender is supplied (single-player)", async () => {
  const { engine } = fakeEngine([
    (o) => {
      o.onEvent(sync(false, "", 0));
      o.onEvent({ type: "done", data: null, seq: 1 });
    },
  ]);
  const { items, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-solo",
    "hi",
    output,
    registry,
    { tuning: fast },
  );

  const bubble = items.find((i) => i.feed_type === "user_message");
  expect(bubble?.author).toBeUndefined();
});

test("StreamTurnOptions.mentions reaches the optimistic FeedItemVM.mentions", async () => {
  const { engine } = fakeEngine([
    (o) => {
      o.onEvent(sync(false, "", 0));
      o.onEvent({ type: "done", data: null, seq: 1 });
    },
  ]);
  const store = new ScopeStore();
  const vm = new ConversationVmOutput(store);

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-mentions",
    "@Ada please confirm and I'll send it",
    vm,
    registry,
    { tuning: fast, mentions: [{ userId: "user_a", name: "Ada" }] },
  );

  const snap = store.getSnapshot(
    conversationScope("Houston/Bo", "activity-mentions"),
  ) as ConversationVM;
  const bubble = snap.feed.find((f) => f.feed_type === "user_message");
  expect(bubble?.data).toBe("@Ada please confirm and I'll send it");
  expect(bubble?.mentions).toEqual([{ userId: "user_a", name: "Ada" }]);
});

test("mentions ride the send body so the runtime can persist them", async () => {
  const { engine, sendOpts, texts } = fakeEngine([
    (o) => {
      o.onEvent(sync(false, "", 0));
      o.onEvent({ type: "done", data: null, seq: 1 });
    },
  ]);
  const { output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-wire",
    "@Ada please confirm",
    output,
    registry,
    { tuning: fast, mentions: [{ userId: "user_a", name: "Ada" }] },
  );

  expect(texts[0]).toBe("@Ada please confirm");
  expect(sendOpts[0]?.mentions).toEqual([{ userId: "user_a", name: "Ada" }]);
});

test("a send that mentions nobody carries NO mentions key, on the bubble or the wire", async () => {
  const { engine, sendOpts } = fakeEngine([
    (o) => {
      o.onEvent(sync(false, "", 0));
      o.onEvent({ type: "done", data: null, seq: 1 });
    },
  ]);
  const { items, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-unmentioned",
    "hi",
    output,
    registry,
    { tuning: fast, mentions: [] },
  );

  const bubble = items.find((i) => i.feed_type === "user_message");
  expect(bubble?.mentions).toBeUndefined();
  expect(sendOpts[0]?.mentions).toBeUndefined();
});

test("displayText renders as the bubble while the engine still receives the real prompt", async () => {
  const { engine, sendOpts, texts } = fakeEngine([
    (o) => {
      o.onEvent(sync(false, "", 0));
      o.onEvent({ type: "text", data: "hello", seq: 1 });
      o.onEvent({ type: "done", data: null, seq: 2 });
    },
  ]);
  const { items, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-setup",
    "HIDDEN setup directive the user never sees",
    output,
    registry,
    { tuning: fast, displayText: "Let's set you up" },
  );

  const bubbles = items.filter((i) => i.feed_type === "user_message");
  expect(bubbles).toHaveLength(1);
  expect(bubbles[0]?.data).toBe("Let's set you up");
  expect(texts).toEqual(["HIDDEN setup directive the user never sees"]);
  expect(sendOpts[0]?.displayText).toBe("Let's set you up");
});

test("observer mode surfaces a running turn (spinner + partial) and settles on done", async () => {
  const { engine } = fakeEngine([
    (o) => {
      o.onEvent(sync(true, "Hi the", 5));
      o.onEvent({ type: "text", data: "re", seq: 6 });
      o.onEvent({ type: "done", data: null, seq: 7 });
    },
  ]);
  const { items, sessionStatuses, board, output } = makeOutput();

  observeConversation(
    engine,
    "Houston/Bo",
    "activity-observe",
    output,
    1,
    registry,
    fast,
  );
  await waitFor(() => board.includes("needs_you"));

  expect(sessionStatuses).toEqual(["running", "completed"]);
  const streaming = items.filter(
    (i) => i.feed_type === "assistant_text_streaming",
  );
  expect(streaming[0]?.data).toBe("Hi the");
  const texts = items.filter((i) => i.feed_type === "assistant_text");
  expect(texts).toEqual([{ feed_type: "assistant_text", data: "Hi there" }]);
  expect(board).toEqual(["needs_you"]);
});

test("observer mode closes silently on an idle conversation", async () => {
  let attempts = 0;
  const { engine } = fakeEngine([
    (o) => {
      attempts++;
      o.onEvent(sync(false, "", 3));
    },
  ]);
  const { items, sessionStatuses, board, idleConfirms, output } = makeOutput();

  observeConversation(
    engine,
    "Houston/Bo",
    "activity-idle",
    output,
    2,
    registry,
    fast,
  );
  await waitFor(() => attempts === 1);
  await new Promise((r) => setTimeout(r, 50));

  expect(attempts).toBe(1);
  expect(items).toEqual([]);
  expect(sessionStatuses).toEqual([]);
  expect(board).toEqual([]);
  expect(idleConfirms).toEqual(["activity-idle"]);
});

test("a turn we send supersedes an active observer — no double subscription", async () => {
  let observerAborted = false;
  const { engine, afters } = fakeEngine([
    (o) => {
      o.onEvent(sync(true, "partial", 4));
      return new Promise<void>((resolve) => {
        o.signal?.addEventListener(
          "abort",
          () => {
            observerAborted = true;
            resolve();
          },
          { once: true },
        );
      });
    },
    (o) => {
      o.onEvent(sync(true, "partial", 4));
      o.onEvent({ type: "text", data: "!", seq: 5 });
      o.onEvent({ type: "done", data: null, seq: 6 });
    },
  ]);
  const { items, output } = makeOutput();

  observeConversation(
    engine,
    "Houston/Bo",
    "activity-takeover",
    output,
    1,
    registry,
    fast,
  );
  await waitFor(() => afters.length === 1);
  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-takeover",
    "hi",
    output,
    registry,
    {
      tuning: fast,
    },
  );

  expect(observerAborted).toBe(true);
  expect(afters).toHaveLength(2);
  expect(finals(items)).toHaveLength(1);
});

test("the wire pin rides sendMessage so the turn runs on the conversation's own provider", async () => {
  const { engine, sendOpts } = fakeEngine([
    (o) => {
      o.onEvent(sync(false, "", 0));
      o.onEvent({ type: "done", data: null, seq: 1 });
    },
  ]);
  const { output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-pin",
    "hi",
    output,
    registry,
    {
      tuning: fast,
      pin: { provider: "openai-codex", model: "gpt-5.5", effort: "high" },
    },
  );

  expect(sendOpts[0]).toMatchObject({
    provider: "openai-codex",
    model: "gpt-5.5",
    effort: "high",
  });
});

test("a person's grant reaches the engine send options", async () => {
  const { engine, sendOpts } = fakeEngine([
    (options) => {
      options.onEvent(sync(false, "", 0));
      options.onEvent({ type: "done", data: null, seq: 1 });
    },
  ]);
  const { output } = makeOutput();
  await streamTurn(
    engine,
    "Houston/Bo",
    "hire-chat",
    "hire",
    output,
    registry,
    {
      tuning: fast,
      grants: ["createAgent"],
    },
  );
  expect(sendOpts[0]?.grants).toEqual(["createAgent"]);
});

test("the wire pin also rides the observer-handoff send", async () => {
  const { engine, afters, sendOpts } = fakeEngine([
    (o) => {
      o.onEvent(sync(true, "partial", 4));
      return hang(o);
    },
    (o) => {
      o.onEvent({ type: "done", data: null, seq: 5 });
    },
  ]);
  const { output } = makeOutput();

  observeConversation(
    engine,
    "Houston/Bo",
    "activity-pin-handoff",
    output,
    1,
    registry,
    fast,
  );
  await waitFor(() => afters.length === 1);
  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-pin-handoff",
    "hi",
    output,
    registry,
    { tuning: fast, pin: { provider: "anthropic", model: "claude-opus-4-8" } },
  );

  expect(sendOpts[0]).toMatchObject({
    provider: "anthropic",
    model: "claude-opus-4-8",
  });
});

test("a pin-less turn sends no provider/model fields (runtime resolution untouched)", async () => {
  const { engine, sendOpts } = fakeEngine([
    (o) => {
      o.onEvent(sync(false, "", 0));
      o.onEvent({ type: "done", data: null, seq: 1 });
    },
  ]);
  const { output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-nopin",
    "hi",
    output,
    registry,
    {
      tuning: fast,
    },
  );

  const opts = sendOpts[0] as Record<string, unknown>;
  expect(opts.provider).toBeUndefined();
  expect(opts.model).toBeUndefined();
  expect(opts.effort).toBeUndefined();
});

test("frames from the NEXT turn are a boundary: our turn settles from history by turnId", async () => {
  const history: ChatMessage[] = [
    { role: "user", content: "hi", ts: 1, turnId: "t-1" },
    { role: "assistant", content: "Hello full", ts: 2, turnId: "t-1" },
  ];
  const { engine, nonces } = fakeEngine(
    [
      (o) =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            o.onEvent(sync(false, "", 0));
            o.onEvent({
              type: "user",
              data: { content: "hi", ts: 1, nonce: nonces[0] },
              turnId: "t-1",
              seq: 1,
            });
            o.onEvent({ type: "text", data: "Hel", turnId: "t-1", seq: 2 });
            o.onEvent({ type: "text", data: "FOREIGN", turnId: "t-2", seq: 3 });
            o.onEvent({ type: "done", data: null, turnId: "t-2", seq: 4 });
            resolve();
          }, 10);
        }).then(() => hang(o)),
    ],
    history,
  );
  const { items, sessionStatuses, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-boundary",
    "hi",
    output,
    registry,
    {
      tuning: fast,
    },
  );

  const texts = items.filter((i) => i.feed_type === "assistant_text");
  expect(texts).toEqual([
    { feed_type: "assistant_text", data: "Hello full", turnId: "t-1" },
  ]);
  expect(items.some((i) => String(i.data ?? "").includes("FOREIGN"))).toBe(
    false,
  );
  expect(finals(items)).toHaveLength(1);
  expect(sessionStatuses).toEqual(["running", "completed"]);
});

test("a resync naming a DIFFERENT running turn settles ours; a dead turn settles as ERROR", async () => {
  const history: ChatMessage[] = [
    { role: "user", content: "hi", ts: 1, turnId: "t-1" },
  ];
  const { engine, nonces } = fakeEngine(
    [
      (o) =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            o.onEvent(sync(false, "", 0));
            o.onEvent({
              type: "user",
              data: { content: "hi", ts: 1, nonce: nonces[0] },
              turnId: "t-1",
              seq: 1,
            });
            o.onEvent({ type: "text", data: "Hel", turnId: "t-1", seq: 2 });
            resolve();
          }, 10);
        }),
      (o) => {
        o.onEvent(sync(true, "OTHER", 9, { turnId: "t-2", resync: true }));
        return hang(o);
      },
    ],
    history,
  );
  const { items, sessionStatuses, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-boundary-dead",
    "hi",
    output,
    registry,
    { tuning: fast },
  );

  expect(items.some((i) => String(i.data ?? "").includes("OTHER"))).toBe(false);
  expect(items).toContainEqual({
    feed_type: "system_message",
    data: TURN_DIED_MESSAGE,
    turnId: "t-1",
  });
  expect(sessionStatuses).toEqual(["running", "error"]);
});

test("a running resync for OUR turn replaces accumulated text — empty partial included", async () => {
  const { engine, nonces } = fakeEngine([
    (o) =>
      new Promise<void>((resolve) => {
        setTimeout(() => {
          o.onEvent(sync(false, "", 0));
          o.onEvent({
            type: "user",
            data: { content: "hi", ts: 1, nonce: nonces[0] },
            turnId: "t-1",
            seq: 1,
          });
          o.onEvent({ type: "text", data: "Hello wor", turnId: "t-1", seq: 2 });
          resolve();
        }, 10);
      }),
    (o) => {
      o.onEvent(sync(true, "", 9, { turnId: "t-1", resync: true }));
      o.onEvent({ type: "text", data: "Restarted", turnId: "t-1", seq: 10 });
      o.onEvent({ type: "done", data: null, turnId: "t-1", seq: 11 });
    },
  ]);
  const { items, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-empty-partial",
    "hi",
    output,
    registry,
    { tuning: fast },
  );

  const streaming = items
    .filter((i) => i.feed_type === "assistant_text_streaming")
    .map((i) => i.data);
  expect(streaming).toEqual(["Hello wor", "", "Restarted"]);
  const texts = items.filter((i) => i.feed_type === "assistant_text");
  expect(texts).toEqual([
    { feed_type: "assistant_text", data: "Restarted", turnId: "t-1" },
  ]);
});

test("a fatal stream refusal (401) settles the turn with the engine's message", async () => {
  const { engine } = fakeEngine([
    () => {
      throw new EngineError(401, JSON.stringify({ error: "Session expired" }));
    },
  ]);
  const { items, sessionStatuses, board, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-fatal",
    "hi",
    output,
    registry,
    {
      tuning: fast,
    },
  );

  expect(items).toContainEqual({
    feed_type: "system_message",
    data: "Session expired",
  });
  expect(sessionStatuses).toEqual(["running", "error"]);
  expect(board).toEqual(["running", "error"]);
});

function sendLanded(engine: HoustonEngineClient): () => boolean {
  let landed = false;
  const send = engine.sendMessage.bind(engine);
  engine.sendMessage = (async (...args: Parameters<typeof send>) => {
    const answer = await send(...args);
    landed = true;
    return answer;
  }) as typeof engine.sendMessage;
  return () => landed;
}

test("the failure budget settles a dead-server turn instead of spinning forever", async () => {
  let landed = () => false;
  const { engine, afters } = fakeEngine([() => waitFor(landed)]);
  landed = sendLanded(engine);
  const { items, sessionStatuses, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-budget",
    "hi",
    output,
    registry,
    {
      tuning: fast,
    },
  );

  expect(afters).toHaveLength(8);
  expect(items).toContainEqual({
    feed_type: "system_message",
    data: STREAM_LOST_MESSAGE,
  });
  expect(sessionStatuses).toEqual(["running", "error"]);
});

test("budget exhaustion on aborted/hung attempts settles with product copy, never the raw transport error", async () => {
  let landed = () => false;
  const { engine, afters } = fakeEngine([
    async () => {
      await waitFor(landed);
      const e = new Error("Fetch is aborted");
      e.name = "AbortError";
      throw e;
    },
  ]);
  landed = sendLanded(engine);
  const { items, sessionStatuses, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-budget-abort",
    "hi",
    output,
    registry,
    { tuning: fast },
  );

  expect(afters).toHaveLength(8);
  expect(items).toContainEqual({
    feed_type: "system_message",
    data: STREAM_LOST_MESSAGE,
  });
  expect(items).not.toContainEqual({
    feed_type: "system_message",
    data: "Fetch is aborted",
  });
  expect(sessionStatuses).toEqual(["running", "error"]);
});

test("budget exhaustion keeps the engine's own verdict when the attempts got one", async () => {
  const { engine } = fakeEngine([
    () => {
      throw new EngineError(
        503,
        JSON.stringify({ error: "engine unavailable" }),
      );
    },
  ]);
  const { items, sessionStatuses, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-budget-verdict",
    "hi",
    output,
    registry,
    { tuning: fast },
  );

  expect(items).toContainEqual({
    feed_type: "system_message",
    data: "engine unavailable",
  });
  expect(sessionStatuses).toEqual(["running", "error"]);
});

test("an observer disposes silently on a fatal refusal — no error surface", async () => {
  const { engine, afters } = fakeEngine([
    () => {
      throw new EngineError(404, "gone");
    },
  ]);
  const { items, sessionStatuses, board, output } = makeOutput();

  observeConversation(
    engine,
    "Houston/Bo",
    "activity-observer-fatal",
    output,
    0,
    registry,
    fast,
  );
  await waitFor(() => afters.length === 1);
  await new Promise((r) => setTimeout(r, 30));

  expect(afters).toHaveLength(1);
  expect(items).toEqual([]);
  expect(sessionStatuses).toEqual([]);
  expect(board).toEqual([]);
});

test("an observer mid-render settles visibly when the failure budget runs out", async () => {
  let attempts = 0;
  const { engine } = fakeEngine([
    (o) => {
      attempts++;
      if (attempts === 1) o.onEvent(sync(true, "half a", 3, { turnId: "t-9" }));
    },
  ]);
  const { items, sessionStatuses, output } = makeOutput();

  observeConversation(
    engine,
    "Houston/Bo",
    "activity-observer-budget",
    output,
    1,
    registry,
    fast,
  );
  await waitFor(() => sessionStatuses.includes("error"));

  expect(items).toContainEqual({
    feed_type: "system_message",
    data: STREAM_LOST_MESSAGE,
    turnId: "t-9",
  });
  expect(sessionStatuses).toEqual(["running", "error"]);
});

test("handoff on 202: the observer is disposed and the turn resumes from its cursor", async () => {
  let observerAborted = false;
  const { engine, afters, nonces } = fakeEngine([
    (o) => {
      o.onEvent(sync(true, "old partial", 4, { turnId: "t-A" }));
      return new Promise<void>((resolve) => {
        o.signal?.addEventListener(
          "abort",
          () => {
            observerAborted = true;
            resolve();
          },
          { once: true },
        );
      });
    },
    (o) => {
      o.onEvent({
        type: "user",
        data: { content: "hi", ts: 1, nonce: nonces[0] },
        turnId: "t-B",
        seq: 5,
      });
      o.onEvent({ type: "text", data: "yo", turnId: "t-B", seq: 6 });
      o.onEvent({ type: "done", data: null, turnId: "t-B", seq: 7 });
    },
  ]);
  const { items, output } = makeOutput();

  observeConversation(
    engine,
    "Houston/Bo",
    "activity-handoff-ok",
    output,
    1,
    registry,
    fast,
  );
  await waitFor(() => afters.length === 1);
  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-handoff-ok",
    "hi",
    output,
    registry,
    {
      tuning: fast,
    },
  );

  expect(observerAborted).toBe(true);
  expect(afters).toEqual([undefined, 4]);
  const texts = items.filter((i) => i.feed_type === "assistant_text");
  expect(texts).toEqual([
    { feed_type: "assistant_text", data: "yo", turnId: "t-B" },
  ]);
  expect(finals(items)).toHaveLength(1);
});

test("handoff refused: the observer keeps rendering; the refusal surfaces without an error settle", async () => {
  let observerAborted = false;
  const { engine, afters } = fakeEngine(
    [
      (o) => {
        o.onEvent(sync(true, "their turn", 4, { turnId: "t-A" }));
        return new Promise<void>((resolve) => {
          o.signal?.addEventListener(
            "abort",
            () => {
              observerAborted = true;
              resolve();
            },
            { once: true },
          );
        });
      },
    ],
    [],
    {
      sendError: new EngineError(
        409,
        JSON.stringify({ error: "No provider connected." }),
      ),
    },
  );
  const { items, sessionStatuses, output } = makeOutput();

  observeConversation(
    engine,
    "Houston/Bo",
    "activity-handoff-409",
    output,
    1,
    registry,
    fast,
  );
  await waitFor(() => afters.length === 1);
  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-handoff-409",
    "hi",
    output,
    registry,
    {
      tuning: fast,
    },
  );

  expect(observerAborted).toBe(false);
  expect(afters).toHaveLength(1);
  expect(items).toContainEqual({
    feed_type: "system_message",
    data: "No provider connected.",
    fails_pending: true,
  });
  expect(sessionStatuses).toEqual(["running", "running"]);
  expect(finals(items)).toHaveLength(0);
});

test("handoff meeting turn running holds until the observed turn settles, then sends", async () => {
  let observedDone: () => void = () => {};
  let sends = () => 0;
  let nonceAt = (_i: number): string | undefined => undefined;
  const { engine, afters, nonces } = fakeEngine(
    [
      (o) =>
        new Promise<void>((resolve) => {
          o.onEvent(sync(true, "their turn", 4, { turnId: "t-A" }));
          observedDone = () => {
            o.onEvent({ type: "done", data: null, turnId: "t-A", seq: 5 });
            resolve();
          };
        }),
      async (o) => {
        await waitFor(() => sends() === 2);
        o.onEvent({
          type: "user",
          data: { content: "hi", ts: 1, nonce: nonceAt(1) },
          turnId: "t-B",
          seq: 6,
        });
        o.onEvent({ type: "text", data: "Mine", turnId: "t-B", seq: 7 });
        o.onEvent({ type: "done", data: null, turnId: "t-B", seq: 8 });
      },
    ],
    [],
    { sendErrors: [turnRunningRefusal()] },
  );
  sends = () => nonces.length;
  nonceAt = (i) => nonces[i];
  const { items, sessionStatuses, output } = makeOutput();

  observeConversation(
    engine,
    "Houston/Bo",
    "activity-handoff-held",
    output,
    1,
    registry,
    fast,
  );
  await waitFor(() => afters.length === 1);
  const turn = streamTurn(
    engine,
    "Houston/Bo",
    "activity-handoff-held",
    "hi",
    output,
    registry,
    { tuning: fast },
  );
  await waitFor(() => sends() === 1);
  expect(items.some((i) => i.fails_pending)).toBe(false);
  observedDone();
  await turn;

  expect(nonces).toHaveLength(2);
  expect(new Set(nonces).size).toBe(1);
  expect(afters).toEqual([undefined, 5]);
  expect(items.filter((i) => i.feed_type === "system_message")).toEqual([]);
  expect(sessionStatuses).not.toContain("error");
  expect(
    (finals(items).at(-1)?.data as { result?: string } | undefined)?.result,
  ).toBe("Mine");
});

test("a teardown during a held handoff never sends into the gone client", async () => {
  const { engine, afters, nonces } = fakeEngine(
    [
      (o) => {
        o.onEvent(sync(true, "their turn", 4, { turnId: "t-A" }));
        return hang(o);
      },
    ],
    [],
    { sendErrors: [turnRunningRefusal()] },
  );
  const { output } = makeOutput();
  observeConversation(
    engine,
    "Houston/Bo",
    "activity-held-logout",
    output,
    1,
    registry,
    fast,
  );
  await waitFor(() => afters.length === 1);
  const turn = streamTurn(
    engine,
    "Houston/Bo",
    "activity-held-logout",
    "hi",
    output,
    registry,
    { tuning: fast },
  );
  await waitFor(() => nonces.length === 1);

  registry.disposeAll();
  await turn;

  expect(nonces).toHaveLength(1);
  expect(afters).toHaveLength(1);
  expect(
    registry.get(streamKey("Houston/Bo", "activity-held-logout")),
  ).toBeUndefined();
});

test("a second turn disposes the previous turn's stream — never a silent overwrite", async () => {
  let firstAborted = false;
  const { engine, afters } = fakeEngine([
    (o) => {
      o.onEvent(sync(false, "", 0));
      return new Promise<void>((resolve) => {
        o.signal?.addEventListener(
          "abort",
          () => {
            firstAborted = true;
            resolve();
          },
          { once: true },
        );
      });
    },
    (o) => {
      o.onEvent({ type: "text", data: "second", seq: 1 });
      o.onEvent({ type: "done", data: null, seq: 2 });
    },
  ]);
  const { items, output } = makeOutput();

  const first = streamTurn(
    engine,
    "Houston/Bo",
    "activity-second-turn",
    "one",
    output,
    registry,
    { tuning: fast },
  );
  await waitFor(() => afters.length === 1);
  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-second-turn",
    "two",
    output,
    registry,
    {
      tuning: fast,
    },
  );
  await first;

  expect(firstAborted).toBe(true);
  expect(afters).toHaveLength(2);
  expect(finals(items)).toHaveLength(1);
});

test("disposeAllStreams aborts live observers and empties the registry", async () => {
  let aborted = false;
  const { engine, afters } = fakeEngine([
    (o) => {
      o.onEvent(sync(true, "", 1));
      return new Promise<void>((resolve) => {
        o.signal?.addEventListener(
          "abort",
          () => {
            aborted = true;
            resolve();
          },
          { once: true },
        );
      });
    },
  ]);
  const { output } = makeOutput();

  observeConversation(
    engine,
    "Houston/Bo",
    "activity-dispose",
    output,
    0,
    registry,
    fast,
  );
  await waitFor(() => afters.length === 1);
  registry.disposeAll();
  await waitFor(() => aborted);

  observeConversation(
    engine,
    "Houston/Bo",
    "activity-dispose",
    output,
    0,
    registry,
    fast,
  );
  await waitFor(() => afters.length === 2);
});

test("observeConversation is a no-op while the conversation is already streamed", async () => {
  const { engine, afters } = fakeEngine([
    (o) => {
      o.onEvent(sync(true, "", 1));
      return hang(o);
    },
  ]);
  const { output } = makeOutput();

  observeConversation(
    engine,
    "Houston/Bo",
    "activity-single",
    output,
    0,
    registry,
    fast,
  );
  await waitFor(() => afters.length === 1);
  observeConversation(
    engine,
    "Houston/Bo",
    "activity-single",
    output,
    0,
    registry,
    fast,
  );
  await new Promise((r) => setTimeout(r, 30));

  expect(afters).toHaveLength(1);
});

function deferredSendEngine(handlers: StreamHandler[], history: ChatMessage[]) {
  const afters: Array<number | undefined> = [];
  const nonces: Array<string | undefined> = [];
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const engine = {
    async streamEvents(_id: string, opts: EventStreamOptions) {
      const h = handlers[Math.min(afters.length, handlers.length - 1)];
      afters.push(opts.after);
      await h?.(opts);
    },
    async sendMessage(_id: string, _t: string, o?: { nonce?: string }) {
      nonces.push(o?.nonce);
      await gate;
    },
    async getHistory() {
      return { id: "c", title: "", messages: history };
    },
  } as unknown as HoustonEngineClient;
  return { engine, afters, nonces, release };
}

test("a second concurrent send over an observer fails fast — one real send, no double subscription", async () => {
  const { engine, afters, nonces, release } = deferredSendEngine(
    [
      (o) => {
        o.onEvent(sync(true, "partial", 4, { turnId: "t-A" }));
        return hang(o);
      },
      (o) => {
        o.onEvent({ type: "text", data: "!", seq: 5 });
        o.onEvent({ type: "done", data: null, seq: 6 });
      },
    ],
    [],
  );
  const { items, output } = makeOutput();

  observeConversation(
    engine,
    "Houston/Bo",
    "activity-race",
    output,
    1,
    registry,
    fast,
  );
  await waitFor(() => afters.length === 1);

  const first = streamTurn(
    engine,
    "Houston/Bo",
    "activity-race",
    "hi",
    output,
    registry,
    { tuning: fast },
  );
  await waitFor(() => nonces.length === 1);
  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-race",
    "hi",
    output,
    registry,
    { tuning: fast },
  );

  expect(nonces).toHaveLength(1);
  expect(items).toContainEqual({
    feed_type: "system_message",
    data: SEND_IN_FLIGHT_MESSAGE,
    fails_pending: true,
  });

  release();
  await first;
  expect(nonces).toHaveLength(1);
  expect(finals(items)).toHaveLength(1);
});

test("two registries are isolated: same key coexists and dispose crosses no boundary", async () => {
  const abortFlags = { a: false, b: false };
  const make = (flag: "a" | "b") => {
    const afters: Array<number | undefined> = [];
    const engine = {
      async streamEvents(_id: string, o: EventStreamOptions) {
        afters.push(o.after);
        o.onEvent(sync(true, "", 1));
        return new Promise<void>((resolve) => {
          o.signal?.addEventListener(
            "abort",
            () => {
              abortFlags[flag] = true;
              resolve();
            },
            { once: true },
          );
        });
      },
      async getHistory() {
        return { id: "c", title: "", messages: [] };
      },
    } as unknown as HoustonEngineClient;
    return { engine, afters };
  };
  const a = make("a");
  const b = make("b");
  const regA = new StreamRegistry();
  const regB = new StreamRegistry();
  const { output } = makeOutput();

  observeConversation(
    a.engine,
    "Houston/Bo",
    "activity-iso",
    output,
    0,
    regA,
    fast,
  );
  observeConversation(
    b.engine,
    "Houston/Bo",
    "activity-iso",
    output,
    0,
    regB,
    fast,
  );
  await waitFor(() => a.afters.length === 1 && b.afters.length === 1);

  regA.disposeAll();
  await waitFor(() => abortFlags.a);
  await new Promise((r) => setTimeout(r, 20));
  expect(abortFlags.b).toBe(false);

  regB.disposeAll();
  await waitFor(() => abortFlags.b);
});

test("a transport-failed send whose turn actually started renders and settles normally", async () => {
  const { engine, nonces } = fakeEngine(
    [
      (o) =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            o.onEvent(sync(false, "", 0));
            o.onEvent({
              type: "user",
              data: { content: "Yes.", ts: 1, nonce: nonces[0] },
              turnId: "t-1",
              seq: 1,
            });
            o.onEvent({ type: "text", data: "Done", turnId: "t-1", seq: 2 });
            o.onEvent({ type: "done", data: null, turnId: "t-1", seq: 3 });
            resolve();
          }, 10);
        }).then(() => hang(o)),
    ],
    [],
    { sendError: new TypeError("Load failed") },
  );
  const { items, sessionStatuses, board, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bob",
    "activity-ambiguous-landed",
    "Yes.",
    output,
    registry,
    { tuning: fast },
  );

  expect(sessionStatuses).not.toContain("error");
  expect(finals(items)).toHaveLength(1);
  const texts = items.filter((i) => i.feed_type === "assistant_text");
  expect(texts).toEqual([
    { feed_type: "assistant_text", data: "Done", turnId: "t-1" },
  ]);
  expect(items.map((i) => i.data)).not.toContain("Load failed");
  expect(items.map((i) => i.data)).not.toContain(SEND_LOST_MESSAGE);
  expect(board).toEqual(["running", "needs_you"]);
});

test("a transport-failed send with no evidence of the turn settles as lost after the verdict window", async () => {
  const { engine } = fakeEngine(
    [
      (o) => {
        o.onEvent(sync(false, "", 0));
        return hang(o);
      },
    ],
    [],
    { sendError: new TypeError("Load failed") },
  );
  const { items, sessionStatuses, board, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bob",
    "activity-ambiguous-lost",
    "hi",
    output,
    registry,
    { tuning: { ...fast, sendVerdictMs: 50 } },
  );

  expect(sessionStatuses).toContain("error");
  expect(items).toContainEqual({
    feed_type: "system_message",
    data: SEND_LOST_MESSAGE,
    fails_pending: true,
  });
  expect(board).toEqual(["running", "error"]);
});

test("a definitive send rejection (the engine answered) still fails the turn immediately", async () => {
  const { engine } = fakeEngine([hang], [], {
    sendError: new EngineError(
      409,
      JSON.stringify({ error: "A turn is already running" }),
    ),
  });
  const { items, sessionStatuses, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bob",
    "activity-definitive-reject",
    "hi",
    output,
    registry,
    { tuning: fast },
  );

  expect(sessionStatuses).toContain("error");
  expect(items).toContainEqual({
    feed_type: "system_message",
    data: "A turn is already running",
    fails_pending: true,
  });
});

test("a turn that finished before the first sync settles from history via the poll — no hang, no TURN_DIED", async () => {
  const history: ChatMessage[] = [
    { role: "user", content: "hi", ts: 1 },
    { role: "assistant", content: "Hello from history", ts: 2 },
  ];
  const { engine } = fakeEngine(
    [
      (o) => {
        o.onEvent(sync(false, "", 0));
        return hang(o);
      },
    ],
    history,
  );
  const { items, sessionStatuses, board, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-presettled",
    "hi",
    output,
    registry,
    { tuning: { ...fast, presettledPollMs: 20 } },
  );

  const texts = items.filter((i) => i.feed_type === "assistant_text");
  expect(texts).toEqual([
    { feed_type: "assistant_text", data: "Hello from history" },
  ]);
  expect(finals(items)).toHaveLength(1);
  expect(items).not.toContainEqual({
    feed_type: "system_message",
    data: TURN_DIED_MESSAGE,
  });
  expect(sessionStatuses).toEqual(["running", "completed"]);
  expect(board).toEqual(["running", "needs_you"]);
});

test("a pre-settled ask_user turn recovers its persisted interaction onto the needs_you settle", async () => {
  const interaction: PendingInteraction = {
    steps: [
      {
        kind: "question",
        id: "q1",
        question: "What should the routine do?",
        options: [{ id: "email", label: "Check my email" }],
      },
    ],
  };
  const history: ChatMessage[] = [
    { role: "user", content: "hi", ts: 1 },
    {
      role: "assistant",
      content: "Pick one:",
      ts: 2,
      pendingInteraction: interaction,
    },
  ];
  const { engine } = fakeEngine(
    [
      (o) => {
        o.onEvent(sync(false, "", 0));
        return hang(o);
      },
    ],
    history,
  );
  const { board, boardInteractions, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-presettled-ask",
    "hi",
    output,
    registry,
    { tuning: { ...fast, presettledPollMs: 20 } },
  );

  expect(board).toEqual(["running", "needs_you"]);
  expect(boardInteractions).toEqual([null, interaction]);
});

test("the poll does NOT settle a healthy slow turn (trailing user in history), then frames settle it and cancel the poll", async () => {
  const history: ChatMessage[] = [{ role: "user", content: "hi", ts: 1 }];
  const { engine, historyCalls } = fakeEngine(
    [
      (o) =>
        new Promise<void>((resolve) => {
          o.onEvent(sync(false, "", 0));
          setTimeout(() => {
            o.onEvent({ type: "text", data: "slow reply", seq: 1 });
            o.onEvent({ type: "done", data: null, seq: 2 });
            resolve();
          }, 90);
        }),
    ],
    history,
  );
  const { items, sessionStatuses, board, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-slow-turn",
    "hi",
    output,
    registry,
    { tuning: { ...fast, presettledPollMs: 25 } },
  );

  expect(historyCalls.n).toBeGreaterThanOrEqual(1);
  expect(sessionStatuses).not.toContain("error");
  expect(items).not.toContainEqual({
    feed_type: "system_message",
    data: TURN_DIED_MESSAGE,
  });
  const texts = items.filter((i) => i.feed_type === "assistant_text");
  expect(texts).toEqual([{ feed_type: "assistant_text", data: "slow reply" }]);
  expect(sessionStatuses).toEqual(["running", "completed"]);
  expect(board).toEqual(["running", "needs_you"]);
});

test("dispose clears an armed pre-settled poll — teardown leaves nothing pending", async () => {
  const { output } = makeOutput();
  let historyCalls = 0;
  const sink = new TurnSink({
    agentPath: "Houston/Bo",
    sessionKey: "activity-teardown",
    output,
    mode: "turn",
    nonce: "n",
    prompt: "hi",
    stop: () => {},
    reloadHistory: async () => {
      historyCalls++;
      return [];
    },
    historyGuard: () => false,
    presettledPollMs: 20,
  });

  sink.sendAccepted();
  sink.onFrame(sync(false, "", 0));
  sink.dispose();
  await new Promise((r) => setTimeout(r, 60));

  expect(historyCalls).toBe(0);
  expect(sink.settled).toBe(false);
});

test("accepted send with ZERO frames delivered still settles from history (stuck-chat fix)", async () => {
  const { items, sessionStatuses, output } = makeOutput();
  const sink = new TurnSink({
    agentPath: "Houston/Bo",
    sessionKey: "activity-zero-frames",
    output,
    mode: "turn",
    nonce: "n",
    prompt: "everything is okey?",
    stop: () => {},
    reloadHistory: async (): Promise<ChatMessage[]> => [
      { role: "user", content: "everything is okey?", ts: 1 },
      {
        role: "assistant",
        content: "",
        ts: 2,
        providerError: {
          kind: "unknown",
          provider: "openai-compatible",
          raw_excerpt: "No local model configured.",
        },
      },
    ],
    historyGuard: (messages) =>
      messages.filter((m) => m.role === "user").at(-1)?.content ===
      "everything is okey?",
    presettledPollMs: 20,
  });

  sink.sendAccepted();
  await waitFor(() => sink.settled);

  expect(sink.settled).toBe(true);
  expect(sessionStatuses.at(-1)).toBe("error");
  expect(items.some((i) => i.feed_type === "provider_error")).toBe(true);
});

test("accepted send that is still running does not false-settle from the poll", async () => {
  let historyCalls = 0;
  const { output } = makeOutput();
  const sink = new TurnSink({
    agentPath: "Houston/Bo",
    sessionKey: "activity-still-running",
    output,
    mode: "turn",
    nonce: "n",
    prompt: "slow one",
    stop: () => {},
    reloadHistory: async (): Promise<ChatMessage[]> => {
      historyCalls++;
      return [{ role: "user", content: "slow one", ts: 1 }];
    },
    historyGuard: (messages) =>
      messages.filter((m) => m.role === "user").at(-1)?.content === "slow one",
    presettledPollMs: 15,
  });

  sink.sendAccepted();
  await new Promise((r) => setTimeout(r, 80));

  expect(sink.settled).toBe(false);
  expect(historyCalls).toBeGreaterThan(0);
  sink.dispose();
});

test("an accepted send adopts a stamped error-first frame (failed turn settles, never spins)", () => {
  const { items, sessionStatuses, output } = makeOutput();
  const sink = new TurnSink({
    agentPath: "Houston/Bo",
    sessionKey: "activity-error-first",
    output,
    mode: "turn",
    nonce: "n",
    prompt: "good",
    stop: () => {},
    reloadHistory: async () => [],
    historyGuard: () => false,
    presettledPollMs: 10_000,
  });

  sink.sendAccepted();
  sink.onFrame(sync(false, "", 0));
  sink.onFrame({
    type: "error",
    data: { message: "No local model configured." },
    turnId: "t-fail",
    seq: 1,
  });
  sink.dispose();

  expect(sink.settled).toBe(true);
  expect(sessionStatuses.at(-1)).toBe("error");
  expect(
    items.some(
      (i) =>
        typeof i.data === "string" &&
        i.data.includes("No local model configured"),
    ),
  ).toBe(true);
});

test("a stamped error BEFORE the send is accepted stays foreign (replay tail is never adopted)", () => {
  const { output } = makeOutput();
  const sink = new TurnSink({
    agentPath: "Houston/Bo",
    sessionKey: "activity-error-preaccept",
    output,
    mode: "turn",
    nonce: "n",
    prompt: "good",
    stop: () => {},
    reloadHistory: async () => [],
    historyGuard: () => false,
    presettledPollMs: 10_000,
  });

  sink.onFrame({
    type: "error",
    data: { message: "stale failure from an earlier turn" },
    turnId: "t-old",
    seq: 1,
  });
  sink.dispose();

  expect(sink.settled).toBe(false);
});

test("HOU-1214: observing a turn already seeded from history duplicates nothing", async () => {
  const reply = "Correo enviado";
  const messages: ChatMessage[] = [
    { role: "user", content: "manda el correo", ts: 1, turnId: "t-1" },
    {
      role: "assistant",
      content: reply,
      ts: 2,
      turnId: "t-1",
      thinking: "drafting…",
      tools: [
        {
          name: "integration_execute",
          input: { tool: "GMAIL_SEND_EMAIL" },
          result: "sent",
          isError: false,
        },
      ],
      usage: { context_tokens: 10, output_tokens: 5, cached_tokens: 0 },
    },
  ];
  const store = new ScopeStore();
  const vm = new ConversationVmOutput(store);
  vm.seedHistory("Houston/Bo", "activity-1214", historyToFeed(messages), {
    earliestLoaded: 0,
    total: messages.length,
  });

  const { engine } = fakeEngine(
    [
      (o) => {
        o.onEvent({
          type: "sync",
          data: {
            running: true,
            partial: reply,
            seq: 5,
            turnId: "t-1",
            thinking: "drafting…",
            tools: [
              {
                name: "integration_execute",
                input: { tool: "GMAIL_SEND_EMAIL" },
                isError: false,
                content: "sent",
              },
            ],
          },
          seq: 5,
        });
        o.onEvent({ type: "done", data: null, turnId: "t-1", seq: 6 });
      },
    ],
    messages,
  );
  observeConversation(
    engine,
    "Houston/Bo",
    "activity-1214",
    vm,
    messages.length,
    registry,
    fast,
  );

  const feedOf = () =>
    (
      store.getSnapshot(
        conversationScope("Houston/Bo", "activity-1214"),
      ) as ConversationVM
    ).feed;
  await waitFor(
    () =>
      (
        store.getSnapshot(
          conversationScope("Houston/Bo", "activity-1214"),
        ) as ConversationVM
      ).sessionStatus === "completed",
  );

  const counts = feedOf().reduce<Record<string, number>>((acc, f) => {
    acc[f.feed_type] = (acc[f.feed_type] ?? 0) + 1;
    return acc;
  }, {});
  expect(counts).toEqual({
    user_message: 1,
    thinking: 1,
    tool_call: 1,
    tool_result: 1,
    assistant_text: 1,
    final_result: 1,
  });
  const texts = feedOf().filter((f) => f.feed_type === "assistant_text");
  expect(texts.map((f) => f.data)).toEqual([reply]);
  const final = feedOf().find((f) => f.feed_type === "final_result");
  expect((final?.data as { usage: unknown }).usage).toEqual({
    context_tokens: 10,
    output_tokens: 5,
    cached_tokens: 0,
  });
});

test("HOU-1214: repeated seed+observe cycles stay duplicate-free (the ×4 accumulator)", async () => {
  const reply = "Correo enviado";
  const messages: ChatMessage[] = [
    { role: "user", content: "manda el correo", ts: 1, turnId: "t-1" },
    { role: "assistant", content: reply, ts: 2, turnId: "t-1" },
  ];
  const store = new ScopeStore();
  const vm = new ConversationVmOutput(store);

  for (let round = 0; round < 4; round++) {
    vm.seedHistory("Houston/Bo", "activity-1214b", historyToFeed(messages), {
      earliestLoaded: 0,
      total: messages.length,
    });
    const { engine } = fakeEngine(
      [
        (o) => {
          o.onEvent(sync(true, reply, 5 + round, { turnId: "t-1" }));
          o.onEvent({
            type: "done",
            data: null,
            turnId: "t-1",
            seq: 6 + round,
          });
        },
      ],
      messages,
    );
    observeConversation(
      engine,
      "Houston/Bo",
      "activity-1214b",
      vm,
      messages.length,
      registry,
      fast,
    );
    await waitFor(
      () =>
        (
          store.getSnapshot(
            conversationScope("Houston/Bo", "activity-1214b"),
          ) as ConversationVM
        ).sessionStatus === "completed",
    );
    registry.disposeAll();
  }

  const feed = (
    store.getSnapshot(
      conversationScope("Houston/Bo", "activity-1214b"),
    ) as ConversationVM
  ).feed;
  expect(
    feed.filter((f) => f.feed_type === "assistant_text").map((f) => f.data),
  ).toEqual([reply]);
});

test("attach mid-turn with the echo missed: the sync adopt stamps the optimistic bubble's turnId", async () => {
  const { engine } = fakeEngine([
    (o) => {
      o.onEvent(sync(true, "Roger", 1, { turnId: "turn-2" }));
      o.onEvent({ type: "text", data: " that", seq: 2, turnId: "turn-2" });
      o.onEvent({ type: "done", data: null, seq: 3, turnId: "turn-2" });
    },
  ]);
  const store = new ScopeStore();
  const vm = new ConversationVmOutput(store);

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-missed-echo",
    "second message",
    vm,
    registry,
    { tuning: fast },
  );

  const snap = store.getSnapshot(
    conversationScope("Houston/Bo", "activity-missed-echo"),
  ) as ConversationVM;
  const bubble = snap.feed.find((f) => f.feed_type === "user_message");
  expect(bubble?.data).toBe("second message");
  expect(bubble?.turnId).toBe("turn-2");
  expect(snap.sessionStatus).toBe("completed");
});

test("attach after the turn finished: the poll's history settle stamps the bubble from the persisted reply", async () => {
  const history: ChatMessage[] = [
    { role: "user", content: "second message", ts: 1, turnId: "turn-3" },
    {
      role: "assistant",
      content: 'You said: "second message"',
      ts: 2,
      turnId: "turn-3",
    },
  ];
  const { engine } = fakeEngine(
    [
      (o) => {
        o.onEvent(sync(false, "", 0));
        return hang(o);
      },
    ],
    history,
  );
  const store = new ScopeStore();
  const vm = new ConversationVmOutput(store);

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-presettle-stamp",
    "second message",
    vm,
    registry,
    { tuning: { ...fast, presettledPollMs: 20 } },
  );

  const snap = store.getSnapshot(
    conversationScope("Houston/Bo", "activity-presettle-stamp"),
  ) as ConversationVM;
  const bubble = snap.feed.find((f) => f.feed_type === "user_message");
  expect(bubble?.turnId).toBe("turn-3");
  const reply = snap.feed.find((f) => f.feed_type === "assistant_text");
  expect(reply?.turnId).toBe("turn-3");
  expect(snap.sessionStatus).toBe("completed");
});

test("a waking refusal re-sends the same message until the pod is back", async () => {
  const waking = () =>
    new EngineError(
      503,
      JSON.stringify({
        error: "engine unavailable",
        detail: "agent is waking",
      }),
    );
  let sends = () => 0;
  const { engine, nonces } = fakeEngine(
    [
      async (o) => {
        o.onEvent(sync(false, "", 0));
        await waitFor(() => sends() === 3);
        o.onEvent({ type: "text", data: "Back", seq: 1 });
        o.onEvent({ type: "done", data: null, seq: 2 });
      },
    ],
    [],
    { sendErrors: [waking(), waking()] },
  );
  sends = () => nonces.length;
  const { items, board, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-wake",
    "hi",
    output,
    registry,
    {
      tuning: { ...fast, sendWakeRetryDelaysMs: [1, 1, 1] },
    },
  );

  expect(nonces).toHaveLength(3);
  expect(new Set(nonces).size).toBe(1);
  expect(items.filter((i) => i.feed_type === "system_message")).toEqual([]);
  expect(finals(items)).toHaveLength(1);
  expect(board).toEqual(["running", "needs_you"]);
});

test("a waking refusal past the ladder settles like any rejected send", async () => {
  const waking = () =>
    new EngineError(
      503,
      JSON.stringify({
        error: "engine unavailable",
        detail: "agent is waking",
      }),
    );
  const { engine, nonces } = fakeEngine([hang], [], {
    sendErrors: [waking(), waking(), waking()],
  });
  const { items, sessionStatuses, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-wake-out",
    "hi",
    output,
    registry,
    {
      tuning: { ...fast, sendWakeRetryDelaysMs: [1] },
    },
  );

  expect(nonces).toHaveLength(2);
  expect(sessionStatuses.at(-1)).toBe("error");
  expect(items.map((i) => i.data)).toContain("engine unavailable");
});

test("a non-waking refusal is never re-sent", async () => {
  const { engine, nonces } = fakeEngine([hang], [], {
    sendErrors: [
      new EngineError(409, JSON.stringify({ error: "No provider connected." })),
    ],
  });
  const { output } = makeOutput();
  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-409-once",
    "hi",
    output,
    registry,
    {
      tuning: { ...fast, sendWakeRetryDelaysMs: [1, 1] },
    },
  );
  expect(nonces).toHaveLength(1);
});

test("a send refused as turn running is held and re-sent when the running turn ends", async () => {
  let sends = () => 0;
  let nonceAt = (_i: number): string | undefined => undefined;
  const { engine, nonces } = fakeEngine(
    [
      async (o) => {
        o.onEvent(sync(true, "Earlier reply", 9, { turnId: "t-prev" }));
        await waitFor(() => sends() === 1);
        o.onEvent({ type: "done", data: null, turnId: "t-prev", seq: 10 });
        await waitFor(() => sends() === 2);
        o.onEvent({
          type: "user",
          data: { content: "follow-up", ts: 1, nonce: nonceAt(1) },
          turnId: "t-new",
          seq: 11,
        });
        o.onEvent({ type: "text", data: "Sure", turnId: "t-new", seq: 12 });
        o.onEvent({ type: "done", data: null, turnId: "t-new", seq: 13 });
      },
    ],
    [],
    { sendErrors: [turnRunningRefusal()] },
  );
  sends = () => nonces.length;
  nonceAt = (i) => nonces[i];
  const { items, sessionStatuses, board, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-e2b-tail",
    "follow-up",
    output,
    registry,
    { tuning: { ...fast, sendTurnRunningRetryDelaysMs: [60_000] } },
  );

  expect(nonces).toHaveLength(2);
  expect(new Set(nonces).size).toBe(1);
  expect(items.filter((i) => i.feed_type === "system_message")).toEqual([]);
  expect(items.some((i) => i.fails_pending)).toBe(false);
  expect(sessionStatuses).not.toContain("error");
  expect(items.some((i) => String(i.data ?? "").includes("Earlier"))).toBe(
    false,
  );
  expect(
    (finals(items)[0]?.data as { result?: string } | undefined)?.result,
  ).toBe("Sure");
  expect(board).toEqual(["running", "needs_you"]);
});

test("a re-send that still meets turn running retries on the fallback ladder", async () => {
  let sends = () => 0;
  let nonceAt = (_i: number): string | undefined => undefined;
  const { engine, nonces } = fakeEngine(
    [
      async (o) => {
        o.onEvent(sync(true, "", 9, { turnId: "t-prev" }));
        await waitFor(() => sends() === 1);
        o.onEvent({ type: "done", data: null, turnId: "t-prev", seq: 10 });
        await waitFor(() => sends() === 3);
        o.onEvent({
          type: "user",
          data: { content: "again", ts: 1, nonce: nonceAt(2) },
          turnId: "t-new",
          seq: 11,
        });
        o.onEvent({ type: "done", data: null, turnId: "t-new", seq: 12 });
      },
    ],
    [],
    { sendErrors: [turnRunningRefusal(), turnRunningRefusal()] },
  );
  sends = () => nonces.length;
  nonceAt = (i) => nonces[i];
  const { items, sessionStatuses, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-e2b-claim-lag",
    "again",
    output,
    registry,
    { tuning: { ...fast, sendTurnRunningRetryDelaysMs: [5] } },
  );

  expect(nonces).toHaveLength(3);
  expect(new Set(nonces).size).toBe(1);
  expect(items.filter((i) => i.feed_type === "system_message")).toEqual([]);
  expect(sessionStatuses).toEqual(["running", "completed"]);
});

test("a held re-send whose echo beats its own 202 still renders its reply", async () => {
  let emit: (f: WireFrame) => void = () => {};
  const nonces: Array<string | undefined> = [];
  const engine = {
    async streamEvents(_id: string, o: EventStreamOptions) {
      emit = o.onEvent;
      o.onEvent(sync(true, "", 9, { turnId: "t-prev" }));
      await hang(o);
    },
    async sendMessage(_id: string, _t: string, opts?: { nonce?: string }) {
      nonces.push(opts?.nonce);
      if (nonces.length === 1) {
        setTimeout(() => {
          emit({ type: "done", data: null, turnId: "t-prev", seq: 10 });
        }, 1);
        throw turnRunningRefusal();
      }
      emit({
        type: "user",
        data: { content: "hi", ts: 1, nonce: opts?.nonce },
        turnId: "t-new",
        seq: 11,
      });
      emit({ type: "text", data: "Fast", turnId: "t-new", seq: 12 });
      setTimeout(() => {
        emit({ type: "done", data: null, turnId: "t-new", seq: 13 });
      }, 1);
    },
    async getHistory() {
      return { id: "c", title: "", messages: [] };
    },
  } as unknown as HoustonEngineClient;
  const { items, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-echo-first",
    "hi",
    output,
    registry,
    { tuning: { ...fast, sendTurnRunningRetryDelaysMs: [60_000] } },
  );

  expect(nonces).toHaveLength(2);
  expect(
    (finals(items)[0]?.data as { result?: string } | undefined)?.result,
  ).toBe("Fast");
});

test("a held re-send that fails in transport still adopts its running turn", async () => {
  let sends = () => 0;
  const { engine, nonces } = fakeEngine(
    [
      async (o) => {
        o.onEvent(sync(true, "", 9, { turnId: "t-prev" }));
        await waitFor(() => sends() === 1);
        o.onEvent({ type: "done", data: null, turnId: "t-prev", seq: 10 });
        await waitFor(() => sends() === 2);
        o.onEvent(sync(true, "Hal", 12, { turnId: "t-new", resync: true }));
        o.onEvent({ type: "text", data: "lo", turnId: "t-new", seq: 13 });
        o.onEvent({ type: "done", data: null, turnId: "t-new", seq: 14 });
      },
    ],
    [],
    { sendErrors: [turnRunningRefusal(), new TypeError("Load failed")] },
  );
  sends = () => nonces.length;
  const { items, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-held-lost-202",
    "hi",
    output,
    registry,
    {
      tuning: { ...fast, sendTurnRunningRetryDelaysMs: [60_000] },
    },
  );

  expect(nonces).toHaveLength(2);
  expect(items.some((i) => i.fails_pending)).toBe(false);
  expect(
    (finals(items)[0]?.data as { result?: string } | undefined)?.result,
  ).toBe("Hallo");
});

test("a held re-send lost in transport never adopts the awaited turn's done", async () => {
  let sends = () => 0;
  const { engine, nonces } = fakeEngine(
    [
      async (o) => {
        o.onEvent(sync(true, "Earlier reply", 9, { turnId: "t-prev" }));
        await waitFor(() => sends() === 2);
        await new Promise((r) => setTimeout(r, 10));
        o.onEvent({ type: "done", data: null, turnId: "t-prev", seq: 10 });
        await hang(o);
      },
    ],
    [],
    { sendErrors: [turnRunningRefusal(), new TypeError("Load failed")] },
  );
  sends = () => nonces.length;
  const { items, sessionStatuses, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-held-lost",
    "follow-up",
    output,
    registry,
    {
      tuning: {
        ...fast,
        sendTurnRunningRetryDelaysMs: [5],
        sendVerdictMs: 200,
      },
    },
  );

  expect(finals(items)).toHaveLength(0);
  expect(sessionStatuses.at(-1)).toBe("error");
  expect(items).toContainEqual(
    expect.objectContaining({ data: SEND_LOST_MESSAGE, fails_pending: true }),
  );
});

test("a held re-send accepted before the awaited turn's done renders its own reply", async () => {
  let sends = () => 0;
  let nonceAt = (_i: number): string | undefined => undefined;
  const { engine, nonces } = fakeEngine(
    [
      async (o) => {
        o.onEvent(sync(true, "Earlier reply", 9, { turnId: "t-prev" }));
        await waitFor(() => sends() === 2);
        await new Promise((r) => setTimeout(r, 10));
        o.onEvent({ type: "done", data: null, turnId: "t-prev", seq: 10 });
        o.onEvent({
          type: "user",
          data: { content: "follow-up", ts: 1, nonce: nonceAt(1) },
          turnId: "t-new",
          seq: 11,
        });
        o.onEvent({ type: "text", data: "Mine", turnId: "t-new", seq: 12 });
        o.onEvent({ type: "done", data: null, turnId: "t-new", seq: 13 });
        await hang(o);
      },
    ],
    [],
    { sendErrors: [turnRunningRefusal()] },
  );
  sends = () => nonces.length;
  nonceAt = (i) => nonces[i];
  const { items, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-held-late-done",
    "follow-up",
    output,
    registry,
    {
      tuning: { ...fast, sendTurnRunningRetryDelaysMs: [5] },
    },
  );

  expect(finals(items)).toHaveLength(1);
  expect(
    (finals(items)[0]?.data as { result?: string } | undefined)?.result,
  ).toBe("Mine");
});

test("a hold that outlives its budget settles with the typed send_busy notice", async () => {
  const { engine } = fakeEngine([hang], [], {
    sendError: turnRunningRefusal(),
  });
  const { items, sessionStatuses, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-held-out",
    "hi",
    output,
    registry,
    {
      tuning: {
        ...fast,
        sendTurnRunningRetryDelaysMs: [5],
        sendTurnRunningHoldMs: 30,
      },
    },
  );

  expect(sessionStatuses.at(-1)).toBe("error");
  expect(items).toContainEqual(
    expect.objectContaining({
      feed_type: "system_message",
      notice: "send_busy",
      fails_pending: true,
    }),
  );
  expect(items.some((i) => i.data === "turn running")).toBe(false);
});

test("a held re-send whose turn fails before echoing settles on the 202's turn id", async () => {
  let emit: (f: WireFrame) => void = () => {};
  const nonces: Array<string | undefined> = [];
  const engine = {
    async streamEvents(_id: string, o: EventStreamOptions) {
      emit = o.onEvent;
      o.onEvent(sync(true, "", 9, { turnId: "t-prev" }));
      await hang(o);
    },
    async sendMessage(_id: string, _t: string, opts?: { nonce?: string }) {
      nonces.push(opts?.nonce);
      if (nonces.length === 1) {
        setTimeout(() => {
          emit({ type: "done", data: null, turnId: "t-prev", seq: 10 });
        }, 1);
        throw turnRunningRefusal();
      }
      setTimeout(() => {
        emit({
          type: "error",
          data: {
            message:
              "The reply could not be completed. Please send your message again.",
          },
          turnId: "t-new",
          seq: 11,
        });
      }, 1);
      return { turnId: "t-new" };
    },
    async getHistory() {
      return { id: "c", title: "", messages: [] };
    },
  } as unknown as HoustonEngineClient;
  const { items, sessionStatuses, output } = makeOutput();

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-held-fail-first",
    "hi",
    output,
    registry,
    {
      tuning: { ...fast, sendTurnRunningRetryDelaysMs: [60_000] },
    },
  );

  expect(nonces).toHaveLength(2);
  expect(sessionStatuses.at(-1)).toBe("error");
  expect(items).toContainEqual(
    expect.objectContaining({
      feed_type: "system_message",
      data: "The reply could not be completed. Please send your message again.",
    }),
  );
});

test("C19 message_limit settles as a typed card after one send", async () => {
  const refusal = {
    error: "message limit reached",
    code: "message_limit",
    limit: 40,
    resetsAt: "2026-10-01T00:00:00Z",
  };
  const { engine, nonces } = fakeEngine([hang], [], {
    sendError: new EngineError(429, JSON.stringify(refusal)),
  });
  const { output, items } = makeOutput();
  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-plan-limit",
    "hi",
    output,
    registry,
    {
      tuning: { ...fast, sendWakeRetryDelaysMs: [1, 1] },
    },
  );
  expect(nonces).toHaveLength(1);
  expect(items).toContainEqual(
    expect.objectContaining({
      feed_type: "provider_error",
      data: expect.objectContaining({
        kind: "plan_message_limit",
        resets_at: refusal.resetsAt,
      }),
      fails_pending: true,
    }),
  );
});
