import type {
  ChatMessage,
  EventStreamOptions,
  HoustonEngineClient,
  WireFrame,
} from "@houston/runtime-client";
import { EngineError } from "@houston/runtime-client";
import { afterEach, expect, test } from "vitest";
import type { FeedOutput } from "./feed-output";
import { TURN_DIED_MESSAGE } from "./settle-from-history";
import {
  SEND_IN_FLIGHT_MESSAGE,
  SEND_LOST_MESSAGE,
  STREAM_LOST_MESSAGE,
  StreamRegistry,
} from "./stream-registry";
import {
  observeConversation,
  type StreamTuning,
  streamTurn,
} from "./turn-stream";

/**
 * The resumable turn/observer runners against a scripted fake engine: one
 * handler per connection attempt (the last repeats), so tests can drop the
 * stream mid-turn, script the reconnect's replay or resync, and assert what
 * reaches the FeedOutput — the settle-on-close truncation regression above all.
 */

type StreamHandler = (opts: EventStreamOptions) => void | Promise<void>;

/** A connection that stays open until the client aborts it. */
const hang: StreamHandler = (opts) =>
  new Promise<void>((resolve) => {
    if (opts.signal?.aborted) return resolve();
    opts.signal?.addEventListener("abort", () => resolve(), { once: true });
  });

function fakeEngine(
  handlers: StreamHandler[],
  history: ChatMessage[] = [],
  opts: { sendError?: unknown } = {},
) {
  const afters: Array<number | undefined> = [];
  /** The nonce each sendMessage carried — handlers echo it on `user` frames. */
  const nonces: Array<string | undefined> = [];
  /** The full options each sendMessage carried (the wire pin assertions). */
  const sendOpts: Array<Record<string, unknown> | undefined> = [];
  const engine = {
    async streamEvents(_id: string, streamOpts: EventStreamOptions) {
      const h = handlers[Math.min(afters.length, handlers.length - 1)];
      afters.push(streamOpts.after);
      await h?.(streamOpts);
    },
    async sendMessage(
      _id: string,
      _text: string,
      messageOpts?: { nonce?: string },
    ) {
      nonces.push(messageOpts?.nonce);
      sendOpts.push(messageOpts as Record<string, unknown> | undefined);
      if (opts.sendError !== undefined) throw opts.sendError;
    },
    async getHistory() {
      return { id: "c", title: "", messages: history };
    },
  } as unknown as HoustonEngineClient;
  return { engine, afters, nonces, sendOpts };
}

// Each test drives its own instance registry (no package global); a test that
// leaves a stream live (hang) must not leak it into the next, so dispose all.
const registry = new StreamRegistry();
afterEach(() => registry.disposeAll());

type Item = { feed_type?: string; data?: unknown };

/** A recording FeedOutput: the sink's FeedItems, session statuses, board persists. */
function makeOutput() {
  const items: Item[] = [];
  const sessionStatuses: string[] = [];
  const board: string[] = [];
  const output: FeedOutput = {
    pushFeedItem: (_a, _s, item) => {
      items.push(item as Item);
    },
    sessionStatus: (_a, _s, status) => {
      sessionStatuses.push(status);
    },
    persistBoardStatus: async (_a, _s, status) => {
      board.push(status);
    },
  };
  return { items, sessionStatuses, board, output };
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

// THE REGRESSION this rework exists for: a silently dropped stream used to
// settle the turn from partial text (truncation). Now it reconnects with the
// seq cursor, replays the gap, and settles only on the real `done`.
test("a silent stream close mid-turn reconnects with the cursor and settles on the real done", async () => {
  const { engine, afters } = fakeEngine([
    (o) => {
      o.onEvent(sync(false, "", 0));
      o.onEvent({ type: "text", data: "Hel", seq: 1 });
      // connection closes here — NOT a terminal frame
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

  expect(afters).toEqual([undefined, 1]); // reconnect carried the last seen seq
  const texts = items.filter((i) => i.feed_type === "assistant_text");
  expect(texts).toEqual([{ feed_type: "assistant_text", data: "Hello" }]);
  expect(finals(items)).toHaveLength(1);
  expect(
    (finals(items)[0]?.data as { result?: string } | undefined)?.result,
  ).toBe("Hello");
  expect(board).toEqual(["running", "needs_you"]);
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
        // Cursor 1 is unserviceable (turn over, buffer cleared): resync.
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
  // The FULL persisted reply settled the turn — never the truncated "Hel".
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
  // History ends on OUR user message: the turn never persisted a reply.
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
  // The trailing assistant reply answers "old", not our prompt "hi" — our user
  // message never persisted, so adopting that reply would duplicate it.
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
  expect(bubbles).toHaveLength(1); // ours — the echo never becomes a second one
  expect(bubbles[0]?.data).toBe("hi");
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

  // The spinner flipped on for the observed turn, then completed.
  expect(sessionStatuses).toEqual(["running", "completed"]);
  const streaming = items.filter(
    (i) => i.feed_type === "assistant_text_streaming",
  );
  expect(streaming[0]?.data).toBe("Hi the"); // the sync partial seeded the bubble
  const texts = items.filter((i) => i.feed_type === "assistant_text");
  expect(texts).toEqual([{ feed_type: "assistant_text", data: "Hi there" }]);
  expect(board).toEqual(["needs_you"]); // terminal persist only, no "running" rewrite
});

test("observer mode closes silently on an idle conversation", async () => {
  let attempts = 0;
  const { engine } = fakeEngine([
    (o) => {
      attempts++;
      o.onEvent(sync(false, "", 3));
    },
  ]);
  const { items, sessionStatuses, board, output } = makeOutput();

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

  expect(attempts).toBe(1); // closed after the idle sync — no reconnect loop
  expect(items).toEqual([]);
  expect(sessionStatuses).toEqual([]);
  expect(board).toEqual([]); // nothing persisted for an idle attach
});

test("a turn we send supersedes an active observer — no double subscription", async () => {
  let observerAborted = false;
  const { engine, afters } = fakeEngine([
    (o) => {
      // The observer's connection: a running turn, held open until disposed.
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
      // The turn's own connection.
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
  expect(afters).toHaveLength(2); // observer + turn, never both live
  expect(finals(items)).toHaveLength(1); // exactly one settle
});

// ── Per-turn wire pin (HOU-695) ──────────────────────────────────────────────

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

  // The pin reaches the wire exactly as given — this is what keeps a chat on
  // ITS picked provider regardless of the agent-wide settings.
  expect(sendOpts[0]).toMatchObject({
    provider: "openai-codex",
    model: "gpt-5.5",
    effort: "high",
  });
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

// ── Turn identity (turnId) ───────────────────────────────────────────────────

test("frames from the NEXT turn are a boundary: our turn settles from history by turnId", async () => {
  const history: ChatMessage[] = [
    { role: "user", content: "hi", ts: 1, turnId: "t-1" },
    { role: "assistant", content: "Hello full", ts: 2, turnId: "t-1" },
  ];
  const { engine, nonces } = fakeEngine(
    [
      (o) =>
        new Promise<void>((resolve) => {
          // Delayed so sendMessage has run and the nonce is known.
          setTimeout(() => {
            o.onEvent(sync(false, "", 0));
            o.onEvent({
              type: "user",
              data: { content: "hi", ts: 1, nonce: nonces[0] },
              turnId: "t-1",
              seq: 1,
            });
            o.onEvent({ type: "text", data: "Hel", turnId: "t-1", seq: 2 });
            // The next turn's frames: our terminal was lost — a boundary.
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
  expect(texts).toEqual([{ feed_type: "assistant_text", data: "Hello full" }]);
  // The foreign turn's frames were never folded into ours.
  expect(items.some((i) => String(i.data ?? "").includes("FOREIGN"))).toBe(
    false,
  );
  expect(finals(items)).toHaveLength(1);
  expect(sessionStatuses).toEqual(["running", "completed"]);
});

test("a resync naming a DIFFERENT running turn settles ours; a dead turn settles as ERROR", async () => {
  // History holds only OUR user message: the turn died before replying.
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
            resolve(); // connection drops
          }, 10);
        }),
      (o) => {
        // The reconnect resyncs onto a DIFFERENT running turn.
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

  // The foreign turn's partial was never spliced into our bubble.
  expect(items.some((i) => String(i.data ?? "").includes("OTHER"))).toBe(false);
  expect(items).toContainEqual({
    feed_type: "system_message",
    data: TURN_DIED_MESSAGE,
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
      // Server restarted mid-turn: authoritative partial is EMPTY again.
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
  // The stale accumulation was wiped by the empty authoritative partial...
  expect(streaming).toEqual(["Hello wor", "", "Restarted"]);
  // ...so the settle carries only what the server actually produced.
  const texts = items.filter((i) => i.feed_type === "assistant_text");
  expect(texts).toEqual([{ feed_type: "assistant_text", data: "Restarted" }]);
});

// ── Fatal classification + failure budget ────────────────────────────────────

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

test("the failure budget settles a dead-server turn instead of spinning forever", async () => {
  // Every attempt connects and closes clean without a single frame.
  const { engine, afters } = fakeEngine([() => {}]);
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

  expect(afters).toHaveLength(8); // exactly the budget, then settle + abort
  expect(items).toContainEqual({
    feed_type: "system_message",
    data: STREAM_LOST_MESSAGE,
  });
  expect(sessionStatuses).toEqual(["running", "error"]);
});

// HOU-705: a cold cloud wake holds the SSE connect with no bytes, the resume
// loop's idle watchdog aborts each held attempt, and the budget settle used to
// surface that abort's raw message — WebKit's "Fetch is aborted" — in the chat.
test("budget exhaustion on aborted/hung attempts settles with product copy, never the raw transport error", async () => {
  const { engine, afters } = fakeEngine([
    () => {
      const e = new Error("Fetch is aborted"); // WebKit's AbortError message
      e.name = "AbortError";
      throw e;
    },
  ]);
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
  // The gateway answering 503 after a failed wake IS a verdict with product
  // copy — that survives; only transport-level messages are replaced.
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
      // then the connection closes; every reconnect dies frameless
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
  });
  expect(sessionStatuses).toEqual(["running", "error"]);
});

// ── Observer → turn handoff ──────────────────────────────────────────────────

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
      // The turn's own connection replays from the observer's cursor: our
      // user echo (turnId source) rides the replay, then our frames.
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
  expect(afters).toEqual([undefined, 4]); // resumed exactly from the observer's cursor
  const texts = items.filter((i) => i.feed_type === "assistant_text");
  expect(texts).toEqual([{ feed_type: "assistant_text", data: "yo" }]);
  expect(finals(items)).toHaveLength(1);
});

test("handoff on 409: the observer keeps rendering; the refusal surfaces without an error settle", async () => {
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
        JSON.stringify({ error: "A turn is already running" }),
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

  expect(observerAborted).toBe(false); // the live observer survived the refusal
  expect(afters).toHaveLength(1); // no second subscription was opened
  expect(items).toContainEqual({
    feed_type: "system_message",
    data: "A turn is already running",
  });
  // No terminal settle while a turn demonstrably runs: no error status, no final.
  expect(sessionStatuses).toEqual(["running", "running"]); // observer's + send attempt's
  expect(finals(items)).toHaveLength(0);
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
  expect(finals(items)).toHaveLength(1); // only the second turn settled
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

  // The registry no longer holds the disposed observer: a fresh attach works.
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

  expect(afters).toHaveLength(1); // the second observer never opened a stream
});

// ── Observer→turn handoff double-send race (finding 3) ───────────────────────

/** A fake engine whose `sendMessage` blocks on a gate the test releases. */
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
      await gate; // held until the test releases it
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
        // The observer's connection: a running turn, held open until disposed.
        o.onEvent(sync(true, "partial", 4, { turnId: "t-A" }));
        return hang(o);
      },
      (o) => {
        // The winning turn's own connection, once the gate releases its send.
        // Legacy (unstamped) frames so the fresh turn sink folds them as ours.
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

  // First send reaches the (blocked) sendMessage; second fires while it's in
  // flight — both would have seen the observer as prior before this fix.
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

  // The loser refused without sending a second real turn.
  expect(nonces).toHaveLength(1);
  expect(items).toContainEqual({
    feed_type: "system_message",
    data: SEND_IN_FLIGHT_MESSAGE,
  });

  release();
  await first;
  expect(nonces).toHaveLength(1); // still exactly one turn sent
  expect(finals(items)).toHaveLength(1); // and exactly one settle
});

// ── Registry isolation (finding 4) ───────────────────────────────────────────

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

  // SAME (agentPath, sessionKey) in two registries: a package-global would have
  // no-op'd the second attach; instance registries let both stream.
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

  regA.disposeAll(); // aborts A's stream ONLY
  await waitFor(() => abortFlags.a);
  await new Promise((r) => setTimeout(r, 20));
  expect(abortFlags.b).toBe(false); // B's stream survived A's teardown

  regB.disposeAll();
  await waitFor(() => abortFlags.b);
});

// ── Ambiguous send failure (HOU-683) ─────────────────────────────────────────
// fetch can't distinguish "the POST never reached the engine" from "the engine
// accepted it but the 202 was lost with the connection" — both throw a bare
// TypeError (WebKit: "Load failed"). The stream is the arbiter.

test("a transport-failed send whose turn actually started renders and settles normally", async () => {
  const { engine, nonces } = fakeEngine(
    [
      (o) =>
        new Promise<void>((resolve) => {
          // Delayed so sendMessage has run (and thrown) and the nonce is known.
          setTimeout(() => {
            o.onEvent(sync(false, "", 0));
            // The engine DID accept the send: our echo arrives with the nonce.
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

  // The turn settled from the live frames — never as an error.
  expect(sessionStatuses).not.toContain("error");
  expect(finals(items)).toHaveLength(1);
  const texts = items.filter((i) => i.feed_type === "assistant_text");
  expect(texts).toEqual([{ feed_type: "assistant_text", data: "Done" }]);
  // No misleading transport-error line reached the feed.
  expect(items.map((i) => i.data)).not.toContain("Load failed");
  expect(items.map((i) => i.data)).not.toContain(SEND_LOST_MESSAGE);
  expect(board).toEqual(["running", "needs_you"]);
});

test("a transport-failed send with no evidence of the turn settles as lost after the verdict window", async () => {
  const { engine } = fakeEngine(
    [
      (o) => {
        // The engine never saw the send: the conversation stays idle.
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
  });
});
