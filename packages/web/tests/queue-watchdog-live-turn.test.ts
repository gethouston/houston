import type { SessionStartRequest } from "@houston/engine-adapter";
import { maybeQueueSend } from "@houston/engine-adapter/send-queue";
import {
  disposeAllStreams,
  observeConversation,
  streamTurn,
} from "@houston/engine-adapter/turn-stream";
import { conversationStore } from "@houston/engine-adapter/vm";
import type {
  ChatMessage,
  EventStreamOptions,
  HoustonEngineClient,
  WireFrame,
} from "@houston/runtime-client";
import { EngineError } from "@houston/runtime-client";
import { conversationScope } from "@houston/sdk";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const AGENT = "Houston/Bo";
const msg = (role: "user" | "assistant", content: string): ChatMessage =>
  ({ role, content }) as ChatMessage;

let n = 0;
let key: string;
let dispatched: SessionStartRequest[];
const dispatch = (r: SessionStartRequest) => dispatched.push(r);

function liveTurn() {
  let emit: (f: WireFrame) => void = () => {};
  let nonce: string | undefined;
  const engine = {
    async streamEvents(_id: string, o: EventStreamOptions) {
      emit = o.onEvent;
      await new Promise<void>((resolve) => {
        o.signal?.addEventListener("abort", () => resolve(), { once: true });
      });
    },
    async sendMessage(_id: string, _text: string, opts?: { nonce?: string }) {
      nonce = opts?.nonce;
      queueMicrotask(() => {
        emit({
          type: "sync",
          data: { running: false, partial: "", seq: 0 },
          seq: 0,
        });
        emit({
          type: "user",
          data: { content: "first", ts: 1, nonce },
          turnId: "t-1",
          seq: 1,
        });
        emit({ type: "text", data: "Reply", turnId: "t-1", seq: 2 });
      });
    },
    async getHistory() {
      return { id: "c", title: "", messages: [] };
    },
  } as unknown as HoustonEngineClient;
  const done = () => emit({ type: "done", data: null, turnId: "t-1", seq: 3 });
  return { engine, done };
}

const running = () =>
  (
    conversationStore.getSnapshot(conversationScope(AGENT, key)) as
      | { running?: boolean }
      | undefined
  )?.running;

beforeEach(() => {
  vi.useFakeTimers();
  key = `live-${n++}`;
  dispatched = [];
});

afterEach(() => {
  disposeAllStreams();
  vi.useRealTimers();
});

it("never heals over a live turn stream: the follow-up waits for the terminal frame", async () => {
  const { engine, done } = liveTurn();
  void streamTurn(engine, AGENT, key, "first", async () => {}, {
    tuning: { idleTimeoutMs: 600_000 },
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(running()).toBe(true);

  const probe = vi.fn(async () => [
    msg("user", "first"),
    msg("assistant", "Reply"),
  ]);
  maybeQueueSend(
    AGENT,
    { sessionKey: key, prompt: "follow-up" },
    dispatch,
    probe,
  );

  await vi.advanceTimersByTimeAsync(10_000);
  expect(probe).toHaveBeenCalled();
  expect(dispatched).toHaveLength(0);
  expect(running()).toBe(true);

  done();
  await vi.advanceTimersByTimeAsync(0);
  expect(running()).toBe(false);
  expect(dispatched.map((r) => r.prompt)).toEqual(["follow-up"]);
});

it("still rescues the hold when the live turn never ends", async () => {
  const { engine } = liveTurn();
  void streamTurn(engine, AGENT, key, "first", async () => {}, {
    tuning: { idleTimeoutMs: 600_000 },
  });
  await vi.advanceTimersByTimeAsync(0);
  const probe = vi.fn(async () => [
    msg("user", "first"),
    msg("assistant", "Reply"),
  ]);
  maybeQueueSend(
    AGENT,
    { sessionKey: key, prompt: "follow-up" },
    dispatch,
    probe,
  );

  await vi.advanceTimersByTimeAsync(120_000);
  expect(dispatched.map((r) => r.prompt)).toEqual(["follow-up"]);
});

it("never flushes over a held send, even past the grace", async () => {
  const engine = {
    async streamEvents(_id: string, o: EventStreamOptions) {
      await new Promise<void>((resolve) => {
        o.signal?.addEventListener("abort", () => resolve(), { once: true });
      });
    },
    async sendMessage() {
      throw new EngineError(409, JSON.stringify({ error: "turn running" }));
    },
    async getHistory() {
      return { id: "c", title: "", messages: [] };
    },
  } as unknown as HoustonEngineClient;
  void streamTurn(engine, AGENT, key, "held", async () => {}, {
    tuning: { idleTimeoutMs: 600_000 },
  });
  await vi.advanceTimersByTimeAsync(0);
  const probe = vi.fn(async () => [msg("user", "x"), msg("assistant", "y")]);
  maybeQueueSend(AGENT, { sessionKey: key, prompt: "queued" }, dispatch, probe);

  await vi.advanceTimersByTimeAsync(200_000);
  expect(probe).toHaveBeenCalled();
  expect(dispatched).toHaveLength(0);
  expect(running()).toBe(true);
});

it("keeps a follow-up queued behind a handoff whose observed turn ends mid-POST", async () => {
  const emits: Array<(f: WireFrame) => void> = [];
  const nonces: Array<string | undefined> = [];
  let refuse: (e: unknown) => void = () => {};
  const engine = {
    async streamEvents(_id: string, o: EventStreamOptions) {
      emits.push(o.onEvent);
      if (emits.length === 1)
        o.onEvent({
          type: "sync",
          data: { running: true, partial: "", turnId: "t-prev", seq: 3 },
          seq: 3,
        });
      await new Promise<void>((resolve) => {
        o.signal?.addEventListener("abort", () => resolve(), { once: true });
      });
    },
    sendMessage(_id: string, _text: string, opts?: { nonce?: string }) {
      nonces.push(opts?.nonce);
      if (nonces.length === 1)
        return new Promise((_resolve, reject) => {
          refuse = reject;
        });
      const own = emits[emits.length - 1];
      queueMicrotask(() => {
        own?.({
          type: "user",
          data: { content: "first", ts: 1, nonce: opts?.nonce },
          turnId: "t-mine",
          seq: 5,
        });
        own?.({ type: "text", data: "Reply", turnId: "t-mine", seq: 6 });
        own?.({ type: "done", data: null, turnId: "t-mine", seq: 7 });
      });
      return Promise.resolve({ turnId: "t-mine" });
    },
    async getHistory() {
      return { id: "c", title: "", messages: [] };
    },
  } as unknown as HoustonEngineClient;

  observeConversation(engine, AGENT, key, async () => {}, 1, {
    idleTimeoutMs: 600_000,
  });
  await vi.advanceTimersByTimeAsync(0);
  const turn = streamTurn(engine, AGENT, key, "first", async () => {}, {
    tuning: { idleTimeoutMs: 600_000 },
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(nonces).toHaveLength(1);
  maybeQueueSend(
    AGENT,
    { sessionKey: key, prompt: "follow-up" },
    dispatch,
    async () => [],
  );

  emits[0]?.({ type: "done", data: null, turnId: "t-prev", seq: 4 });
  await vi.advanceTimersByTimeAsync(0);
  expect(dispatched).toHaveLength(0);
  expect(running()).toBe(false);
  expect(
    maybeQueueSend(
      AGENT,
      { sessionKey: key, prompt: "typed later" },
      dispatch,
      async () => [],
    ),
  ).toBe(true);

  refuse(
    new EngineError(
      503,
      JSON.stringify({
        error: "engine unavailable",
        code: "compute_busy",
        retryAfterMs: 1_000,
      }),
    ),
  );
  await vi.advanceTimersByTimeAsync(500);
  expect(dispatched).toHaveLength(0);
  expect(running()).toBe(true);

  await vi.advanceTimersByTimeAsync(2_000);
  await turn;
  expect(nonces).toHaveLength(2);
  expect(new Set(nonces).size).toBe(1);
  expect(dispatched).toHaveLength(1);
  expect(dispatched[0]?.prompt).toContain("follow-up");
  expect(dispatched[0]?.prompt).toContain("typed later");
});
