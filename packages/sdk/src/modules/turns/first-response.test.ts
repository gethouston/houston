import {
  type ChatMessage,
  EngineError,
  type EventStreamOptions,
  type HoustonEngineClient,
  type WireFrame,
} from "@houston/runtime-client";
import { afterEach, expect, test, vi } from "vitest";
import type { FeedOutput } from "./feed-output";
import type { FirstResponse } from "./first-response";
import { StreamRegistry, type StreamTuning } from "./stream-registry";
import { observeConversation, streamTurn } from "./turn-stream";

type Handler = (opts: EventStreamOptions) => void | Promise<void>;

const hang: Handler = (opts) =>
  new Promise<void>((resolve) => {
    if (opts.signal?.aborted) return resolve();
    opts.signal?.addEventListener("abort", () => resolve(), { once: true });
  });

function fakeEngine(
  handlers: Record<string, Handler>,
  opts: {
    sendError?: unknown;
    history?: ChatMessage[];
    sendHeld?: Promise<void>;
  } = {},
) {
  const nonces: Record<string, string | undefined> = {};
  const engine = {
    async streamEvents(id: string, streamOpts: EventStreamOptions) {
      await handlers[id]?.(streamOpts);
    },
    async sendMessage(id: string, _text: string, o?: { nonce?: string }) {
      nonces[id] = o?.nonce;
      await opts.sendHeld;
      if (opts.sendError !== undefined) throw opts.sendError;
    },
    async getHistory() {
      return { id: "c", title: "", messages: opts.history ?? [] };
    },
  } as unknown as HoustonEngineClient;
  return { engine, nonces };
}

function recorder() {
  const reports: Array<{ sessionKey: string } & FirstResponse> = [];
  const output: FeedOutput = {
    pushFeedItem: () => {},
    sessionStatus: () => {},
    persistBoardStatus: async () => {},
    firstResponse: (_a, sessionKey, response) => {
      reports.push({ sessionKey, ...response });
    },
  };
  return { reports, output };
}

const registry = new StreamRegistry();
afterEach(() => {
  registry.disposeAll();
  vi.useRealTimers();
});

const fast: StreamTuning = {
  idleTimeoutMs: 2_000,
  backoff: { initialMs: 1, maxMs: 2, jitter: () => 0 },
};

const frame = (f: WireFrame): WireFrame => f;
const sync = (running = false, partial = "", resync?: true): WireFrame => ({
  type: "sync",
  data: { running, partial, seq: 0, ...(resync ? { resync } : {}) },
});

async function waitFor(cond: () => boolean, ms = 2_000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
}

test("a turn's first text reports first_text, timed from when the turn was sent", async () => {
  const { engine } = fakeEngine({
    a: (o) => {
      o.onEvent(sync());
      o.onEvent(frame({ type: "text", data: "Hello" }));
      o.onEvent(frame({ type: "text", data: " there" }));
      o.onEvent(frame({ type: "done", data: null }));
    },
  });
  const { reports, output } = recorder();
  const before = Date.now();

  await streamTurn(engine, "Ag", "a", "hi", output, registry, {
    tuning: fast,
  });

  expect(reports).toHaveLength(1);
  expect(reports[0]?.outcome).toBe("first_text");
  expect(reports[0]?.sentAt).toBeGreaterThanOrEqual(before);
  expect(reports[0]?.at).toBeGreaterThanOrEqual(reports[0]?.sentAt ?? 0);
});

test("two concurrent conversations: each send is answered only by its own turn's text", async () => {
  let releaseA: () => void = () => {};
  const aMayAnswer = new Promise<void>((r) => {
    releaseA = r;
  });
  const { engine } = fakeEngine({
    a: async (o) => {
      o.onEvent(sync());
      await aMayAnswer;
      o.onEvent(frame({ type: "text", data: "A here" }));
      o.onEvent(frame({ type: "done", data: null }));
    },
    b: (o) => {
      o.onEvent(sync());
      o.onEvent(frame({ type: "text", data: "B here" }));
      o.onEvent(frame({ type: "done", data: null }));
    },
  });
  const { reports, output } = recorder();

  const a = streamTurn(engine, "Ag", "a", "first", output, registry, {
    tuning: fast,
  });
  const b = streamTurn(engine, "Ag", "b", "second", output, registry, {
    tuning: fast,
  });
  await b;
  expect(reports.map((r) => [r.sessionKey, r.outcome])).toEqual([
    ["b", "first_text"],
  ]);

  releaseA();
  await a;
  expect(reports.map((r) => [r.sessionKey, r.outcome])).toEqual([
    ["b", "first_text"],
    ["a", "first_text"],
  ]);
  const ra = reports[1];
  const rb = reports[0];
  expect(ra && rb && ra.at >= rb.at).toBe(true);
  expect(ra && ra.at - ra.sentAt >= 0).toBe(true);
});

test("another writer's turn in the same conversation never answers our send", async () => {
  const { engine, nonces } = fakeEngine({
    a: async (o) => {
      o.onEvent(sync());
      o.onEvent(frame({ type: "text", data: "theirs", turnId: "t-other" }));
      await waitFor(() => nonces.a !== undefined);
      o.onEvent(
        frame({
          type: "user",
          data: { nonce: nonces.a },
          turnId: "t-ours",
        } as WireFrame),
      );
      o.onEvent(frame({ type: "text", data: "ours", turnId: "t-ours" }));
      o.onEvent(frame({ type: "done", data: null, turnId: "t-ours" }));
    },
  });
  const { reports, output } = recorder();

  await streamTurn(engine, "Ag", "a", "hi", output, registry, { tuning: fast });

  expect(reports).toHaveLength(1);
  expect(reports[0]).toMatchObject({ outcome: "first_text", turnId: "t-ours" });
});

async function oneTurn(frames: WireFrame[], tuning: StreamTuning = fast) {
  const { engine } = fakeEngine({
    a: (o) => {
      o.onEvent(sync());
      for (const f of frames) o.onEvent(f);
    },
  });
  const { reports, output } = recorder();
  await streamTurn(engine, "Ag", "a", "hi", output, registry, { tuning });
  return reports;
}

test("a turn that fails before any text reports error", async () => {
  const reports = await oneTurn([
    { type: "error", data: { message: "The model is overloaded" } },
  ]);
  expect(reports.map((r) => r.outcome)).toEqual(["error"]);
});

test("a typed provider failure before any text reports error", async () => {
  const reports = await oneTurn([
    {
      type: "provider_error",
      data: {
        kind: "rate_limited",
        provider: "anthropic",
        message: "slow down",
      },
    } as WireFrame,
  ]);
  expect(reports.map((r) => r.outcome)).toEqual(["error"]);
});

test("a stop before any text reports cancelled", async () => {
  const reports = await oneTurn([
    { type: "tool_start", data: { name: "search", args: {} } } as WireFrame,
    { type: "error", data: { message: "Stopped by user" } },
  ]);
  expect(reports.map((r) => r.outcome)).toEqual(["cancelled"]);
});

test("text before a failure or a stop still counts as the first response", async () => {
  const failed = await oneTurn([
    { type: "text", data: "Working on it" },
    { type: "error", data: { message: "The model is overloaded" } },
  ]);
  expect(failed.map((r) => r.outcome)).toEqual(["first_text"]);
});

test("a turn that ends cleanly with tools only reports no_text", async () => {
  const reports = await oneTurn([
    { type: "tool_start", data: { name: "search", args: {} } } as WireFrame,
    {
      type: "tool_end",
      data: { name: "search", content: "ok", isError: false },
    } as WireFrame,
    { type: "done", data: null },
  ]);
  expect(reports.map((r) => r.outcome)).toEqual(["no_text"]);
});

test("blank streamed text is not a first response", async () => {
  const reports = await oneTurn([
    { type: "text", data: "\n\n" },
    { type: "tool_start", data: { name: "search", args: {} } } as WireFrame,
    { type: "text", data: "Found it" },
    { type: "done", data: null },
  ]);
  expect(reports.map((r) => r.outcome)).toEqual(["first_text"]);
});

test("a send the engine rejects reports error", async () => {
  const { engine } = fakeEngine(
    { a: hang },
    {
      sendError: new EngineError(
        409,
        JSON.stringify({ error: "Another message is running" }),
      ),
    },
  );
  const { reports, output } = recorder();
  await streamTurn(engine, "Ag", "a", "hi", output, registry, { tuning: fast });
  expect(reports.map((r) => r.outcome)).toEqual(["error"]);
});

function gate() {
  let open: () => void = () => {};
  const opened = new Promise<void>((r) => {
    open = r;
  });
  return { open, opened };
}

test("an answer slower than a minute keeps its full duration", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(1_000_000);
  const later = gate();
  const { engine } = fakeEngine({
    a: async (o) => {
      o.onEvent(sync());
      await later.opened;
      o.onEvent(frame({ type: "text", data: "Done thinking" }));
      o.onEvent(frame({ type: "done", data: null }));
    },
  });
  const { reports, output } = recorder();
  const turn = streamTurn(engine, "Ag", "a", "hi", output, registry, {
    tuning: fast,
  });
  vi.setSystemTime(1_095_000);
  later.open();
  await turn;

  expect(reports).toHaveLength(1);
  expect(reports[0]).toMatchObject({
    outcome: "first_text",
    sentAt: 1_000_000,
    at: 1_095_000,
  });
});

test("a turn with no outcome by the deadline reports timeout, and nothing after", async () => {
  const later = gate();
  const { engine } = fakeEngine({
    a: async (o) => {
      o.onEvent(sync());
      await later.opened;
      o.onEvent(frame({ type: "text", data: "Finally" }));
      o.onEvent(frame({ type: "done", data: null }));
    },
  });
  const { reports, output } = recorder();
  const turn = streamTurn(engine, "Ag", "a", "hi", output, registry, {
    tuning: { ...fast, firstResponseTimeoutMs: 20 },
  });
  await waitFor(() => reports.length > 0);
  expect(reports.map((r) => r.outcome)).toEqual(["timeout"]);

  later.open();
  await turn;
  expect(reports.map((r) => r.outcome)).toEqual(["timeout"]);
});

test("a stream the client tears down reports nothing, not even a timeout", async () => {
  const { engine } = fakeEngine({ a: hang });
  const { reports, output } = recorder();
  const turn = streamTurn(engine, "Ag", "a", "hi", output, registry, {
    tuning: { ...fast, firstResponseTimeoutMs: 20 },
  });
  await new Promise((r) => setTimeout(r, 5));
  registry.disposeAll();
  await turn;
  await new Promise((r) => setTimeout(r, 40));
  expect(reports).toEqual([]);
});

test("an observed turn never reports a first response", async () => {
  const { engine } = fakeEngine({
    a: (o) => {
      o.onEvent(sync(true, "Hi from a teammate"));
      o.onEvent(frame({ type: "text", data: "!" }));
      o.onEvent(frame({ type: "done", data: null }));
    },
  });
  const { reports, output } = recorder();
  observeConversation(engine, "Ag", "a", output, 0, registry, fast);
  await new Promise((r) => setTimeout(r, 30));
  expect(reports).toEqual([]);
});

test("a reply recovered from history after a lost stream is the first response", async () => {
  const { engine, nonces } = fakeEngine(
    {
      a: async (o) => {
        o.onEvent(sync());
        await waitFor(() => nonces.a !== undefined);
        o.onEvent(
          frame({
            type: "user",
            data: { nonce: nonces.a },
            turnId: "t1",
          } as WireFrame),
        );
        o.onEvent(frame({ type: "text", data: "next", turnId: "t2" }));
        await hang(o);
      },
    },
    {
      history: [
        { role: "user", content: "hi", turnId: "t1" },
        { role: "assistant", content: "Recovered answer", turnId: "t1" },
      ] as ChatMessage[],
    },
  );
  const { reports, output } = recorder();
  await streamTurn(engine, "Ag", "a", "hi", output, registry, { tuning: fast });
  expect(reports).toHaveLength(1);
  expect(reports[0]).toMatchObject({ outcome: "first_text", turnId: "t1" });
});

test("a turn the engine restarted under, with no text yet, reports interrupted", async () => {
  const { engine, nonces } = fakeEngine(
    {
      a: async (o) => {
        o.onEvent(sync());
        await waitFor(() => nonces.a !== undefined);
        o.onEvent(
          frame({
            type: "user",
            data: { nonce: nonces.a },
            turnId: "t1",
          } as WireFrame),
        );
        o.onEvent(sync(false, "", true));
        await hang(o);
      },
    },
    {
      history: [
        { role: "user", content: "hi", turnId: "t1" },
        {
          role: "assistant",
          content: "",
          turnId: "t1",
          interrupted: { resumed: false },
        },
      ] as ChatMessage[],
    },
  );
  const { reports, output } = recorder();
  await streamTurn(engine, "Ag", "a", "hi", output, registry, { tuning: fast });
  expect(reports.map((r) => r.outcome)).toEqual(["interrupted"]);
});

const refused = () =>
  new EngineError(409, JSON.stringify({ error: "Another message is running" }));

test("a teardown while the send is still in flight reports nothing, even when the send fails later", async () => {
  const post = gate();
  const { engine } = fakeEngine(
    { a: hang },
    { sendHeld: post.opened, sendError: refused() },
  );
  const { reports, output } = recorder();
  const turn = streamTurn(engine, "Ag", "a", "hi", output, registry, {
    tuning: { ...fast, firstResponseTimeoutMs: 30 },
  });
  await new Promise((r) => setTimeout(r, 5));
  registry.disposeAll();
  await new Promise((r) => setTimeout(r, 50));
  post.open();
  await turn;
  expect(reports).toEqual([]);
});

test("a teardown during an observer handoff's send reports nothing", async () => {
  const post = gate();
  const { engine } = fakeEngine(
    {
      a: async (o) => {
        o.onEvent(sync(true, "A teammate's turn"));
        await hang(o);
      },
    },
    { sendHeld: post.opened, sendError: refused() },
  );
  const { reports, output } = recorder();
  observeConversation(engine, "Ag", "a", output, 0, registry, fast);
  await new Promise((r) => setTimeout(r, 5));
  const turn = streamTurn(engine, "Ag", "a", "hi", output, registry, {
    tuning: fast,
  });
  await new Promise((r) => setTimeout(r, 5));
  registry.disposeAll();
  post.open();
  await turn;
  expect(reports).toEqual([]);
});

test("an observer handoff whose send the engine refuses reports error", async () => {
  const { engine } = fakeEngine(
    {
      a: async (o) => {
        o.onEvent(sync(true, "A teammate's turn"));
        await hang(o);
      },
    },
    { sendError: refused() },
  );
  const { reports, output } = recorder();
  observeConversation(engine, "Ag", "a", output, 0, registry, fast);
  await new Promise((r) => setTimeout(r, 5));
  await streamTurn(engine, "Ag", "a", "hi", output, registry, { tuning: fast });
  expect(reports.map((r) => r.outcome)).toEqual(["error"]);
});
