import type {
  ChatMessage,
  EventStreamOptions,
  HoustonEngineClient,
  WireFrame,
} from "@houston/runtime-client";
import { EngineError } from "@houston/runtime-client";
import { afterEach, expect, test } from "vitest";
import { bus } from "../src/engine-adapter/bus";
import { STREAM_LOST_MESSAGE } from "../src/engine-adapter/stream-registry";
import { TURN_DIED_MESSAGE } from "../src/engine-adapter/turn-settle";
import {
  disposeAllStreams,
  observeConversation,
  type StreamTuning,
  streamTurn,
} from "../src/engine-adapter/turn-stream";

/**
 * The resumable turn/observer runners against a scripted fake engine: one
 * handler per connection attempt (the last repeats), so tests can drop the
 * stream mid-turn, script the reconnect's replay or resync, and assert what
 * reaches the bus — the settle-on-close truncation regression above all.
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
  const engine = {
    async streamEvents(_id: string, streamOpts: EventStreamOptions) {
      const h = handlers[Math.min(afters.length, handlers.length - 1)];
      afters.push(streamOpts.after);
      await h?.(streamOpts);
    },
    async sendMessage(
      _id: string,
      _text: string,
      sendOpts?: { nonce?: string },
    ) {
      nonces.push(sendOpts?.nonce);
      if (opts.sendError !== undefined) throw opts.sendError;
    },
    async getHistory() {
      return { id: "c", title: "", messages: history };
    },
  } as unknown as HoustonEngineClient;
  return { engine, afters, nonces };
}

// Every subscription registers in the module-level stream registry; a test
// that leaves one live (hang) must not leak it into the next test.
afterEach(() => disposeAllStreams());

type Item = { feed_type?: string; data?: unknown };

/** Collect this session's feed items + session statuses off the bus. */
function collectBus(sessionKey: string) {
  const items: Item[] = [];
  const statuses: string[] = [];
  const off = bus.on((e) => {
    const ev = e as {
      type: string;
      data?: { session_key?: string; item?: unknown; status?: string };
    };
    if (ev.data?.session_key !== sessionKey) return;
    if (ev.type === "FeedItem") items.push(ev.data.item as Item);
    if (ev.type === "SessionStatus" && ev.data.status)
      statuses.push(ev.data.status);
  });
  return { items, statuses, stop: off };
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
  const statuses: string[] = [];
  const feed = collectBus("activity-resume");

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-resume",
    "hi",
    async (s) => {
      statuses.push(s);
    },
    fast,
  );
  feed.stop();

  expect(afters).toEqual([undefined, 1]); // reconnect carried the last seen seq
  const texts = feed.items.filter((i) => i.feed_type === "assistant_text");
  expect(texts).toEqual([{ feed_type: "assistant_text", data: "Hello" }]);
  expect(finals(feed.items)).toHaveLength(1);
  expect(
    (finals(feed.items)[0]?.data as { result?: string } | undefined)?.result,
  ).toBe("Hello");
  expect(statuses).toEqual(["running", "needs_you"]);
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
  const statuses: string[] = [];
  const feed = collectBus("activity-resync");

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-resync",
    "hi",
    async (s) => {
      statuses.push(s);
    },
    fast,
  );
  feed.stop();

  expect(afters.slice(0, 2)).toEqual([undefined, 1]);
  // The FULL persisted reply settled the turn — never the truncated "Hel".
  const texts = feed.items.filter((i) => i.feed_type === "assistant_text");
  expect(texts).toEqual([{ feed_type: "assistant_text", data: "Hello world" }]);
  const final = finals(feed.items)[0]?.data as
    | { result?: string; usage?: { context_tokens?: number } | null }
    | undefined;
  expect(final?.result).toBe("Hello world");
  expect(final?.usage?.context_tokens).toBe(42);
  expect(statuses).toEqual(["running", "needs_you"]);
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
  const feed = collectBus("activity-dead");

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-dead",
    "hi",
    async () => {},
    fast,
  );
  feed.stop();

  const texts = feed.items.filter((i) => i.feed_type === "assistant_text");
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
  const feed = collectBus("activity-guard");

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-guard",
    "hi",
    async () => {},
    fast,
  );
  feed.stop();

  const texts = feed.items.filter((i) => i.feed_type === "assistant_text");
  expect(texts).toEqual([{ feed_type: "assistant_text", data: "Hel" }]);
});

test("the engine's user echo is never rendered (the app pushes it optimistically)", async () => {
  const { engine } = fakeEngine([
    (o) => {
      o.onEvent(sync(false, "", 0));
      o.onEvent({ type: "user", data: { content: "hi", ts: 1 }, seq: 1 });
      o.onEvent({ type: "text", data: "yo", seq: 2 });
      o.onEvent({ type: "done", data: null, seq: 3 });
    },
  ]);
  const feed = collectBus("activity-echo");

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-echo",
    "hi",
    async () => {},
    fast,
  );
  feed.stop();

  expect(feed.items.some((i) => i.feed_type === "user_message")).toBe(false);
});

test("observer mode surfaces a running turn (spinner + partial) and settles on done", async () => {
  const { engine } = fakeEngine([
    (o) => {
      o.onEvent(sync(true, "Hi the", 5));
      o.onEvent({ type: "text", data: "re", seq: 6 });
      o.onEvent({ type: "done", data: null, seq: 7 });
    },
  ]);
  const statuses: string[] = [];
  const feed = collectBus("activity-observe");

  observeConversation(
    engine,
    "Houston/Bo",
    "activity-observe",
    async (s) => {
      statuses.push(s);
    },
    1,
    fast,
  );
  await waitFor(() => statuses.includes("needs_you"));
  feed.stop();

  // The spinner flipped on for the observed turn, then completed.
  expect(feed.statuses).toEqual(["running", "completed"]);
  const streaming = feed.items.filter(
    (i) => i.feed_type === "assistant_text_streaming",
  );
  expect(streaming[0]?.data).toBe("Hi the"); // the sync partial seeded the bubble
  const texts = feed.items.filter((i) => i.feed_type === "assistant_text");
  expect(texts).toEqual([{ feed_type: "assistant_text", data: "Hi there" }]);
  expect(statuses).toEqual(["needs_you"]); // terminal persist only, no "running" rewrite
});

test("observer mode closes silently on an idle conversation", async () => {
  let attempts = 0;
  const { engine } = fakeEngine([
    (o) => {
      attempts++;
      o.onEvent(sync(false, "", 3));
    },
  ]);
  const feed = collectBus("activity-idle");

  observeConversation(
    engine,
    "Houston/Bo",
    "activity-idle",
    async () => {
      throw new Error("must not persist anything");
    },
    2,
    fast,
  );
  await waitFor(() => attempts === 1);
  await new Promise((r) => setTimeout(r, 50));
  feed.stop();

  expect(attempts).toBe(1); // closed after the idle sync — no reconnect loop
  expect(feed.items).toEqual([]);
  expect(feed.statuses).toEqual([]);
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
  const feed = collectBus("activity-takeover");

  observeConversation(
    engine,
    "Houston/Bo",
    "activity-takeover",
    async () => {},
    1,
    fast,
  );
  await waitFor(() => afters.length === 1);
  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-takeover",
    "hi",
    async () => {},
    fast,
  );
  feed.stop();

  expect(observerAborted).toBe(true);
  expect(afters).toHaveLength(2); // observer + turn, never both live
  expect(finals(feed.items)).toHaveLength(1); // exactly one settle
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
  const feed = collectBus("activity-boundary");

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-boundary",
    "hi",
    async () => {},
    fast,
  );
  feed.stop();

  const texts = feed.items.filter((i) => i.feed_type === "assistant_text");
  expect(texts).toEqual([{ feed_type: "assistant_text", data: "Hello full" }]);
  // The foreign turn's frames were never folded into ours.
  expect(feed.items.some((i) => String(i.data ?? "").includes("FOREIGN"))).toBe(
    false,
  );
  expect(finals(feed.items)).toHaveLength(1);
  expect(feed.statuses).toEqual(["running", "completed"]);
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
  const feed = collectBus("activity-boundary-dead");

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-boundary-dead",
    "hi",
    async () => {},
    fast,
  );
  feed.stop();

  // The foreign turn's partial was never spliced into our bubble.
  expect(feed.items.some((i) => String(i.data ?? "").includes("OTHER"))).toBe(
    false,
  );
  expect(feed.items).toContainEqual({
    feed_type: "system_message",
    data: TURN_DIED_MESSAGE,
  });
  expect(feed.statuses).toEqual(["running", "error"]);
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
  const feed = collectBus("activity-empty-partial");

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-empty-partial",
    "hi",
    async () => {},
    fast,
  );
  feed.stop();

  const streaming = feed.items
    .filter((i) => i.feed_type === "assistant_text_streaming")
    .map((i) => i.data);
  // The stale accumulation was wiped by the empty authoritative partial...
  expect(streaming).toEqual(["Hello wor", "", "Restarted"]);
  // ...so the settle carries only what the server actually produced.
  const texts = feed.items.filter((i) => i.feed_type === "assistant_text");
  expect(texts).toEqual([{ feed_type: "assistant_text", data: "Restarted" }]);
});

// ── Fatal classification + failure budget ────────────────────────────────────

test("a fatal stream refusal (401) settles the turn with the engine's message", async () => {
  const { engine } = fakeEngine([
    () => {
      throw new EngineError(401, JSON.stringify({ error: "Session expired" }));
    },
  ]);
  const statuses: string[] = [];
  const feed = collectBus("activity-fatal");

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-fatal",
    "hi",
    async (s) => {
      statuses.push(s);
    },
    fast,
  );
  feed.stop();

  expect(feed.items).toContainEqual({
    feed_type: "system_message",
    data: "Session expired",
  });
  expect(feed.statuses).toEqual(["running", "error"]);
  expect(statuses).toEqual(["running", "error"]);
});

test("the failure budget settles a dead-server turn instead of spinning forever", async () => {
  // Every attempt connects and closes clean without a single frame.
  const { engine, afters } = fakeEngine([() => {}]);
  const feed = collectBus("activity-budget");

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-budget",
    "hi",
    async () => {},
    fast,
  );
  feed.stop();

  expect(afters).toHaveLength(6); // exactly the budget, then settle + abort
  expect(feed.items).toContainEqual({
    feed_type: "system_message",
    data: STREAM_LOST_MESSAGE,
  });
  expect(feed.statuses).toEqual(["running", "error"]);
});

test("an observer disposes silently on a fatal refusal — no error surface", async () => {
  const { engine, afters } = fakeEngine([
    () => {
      throw new EngineError(404, "gone");
    },
  ]);
  const feed = collectBus("activity-observer-fatal");

  observeConversation(
    engine,
    "Houston/Bo",
    "activity-observer-fatal",
    async () => {
      throw new Error("must not persist anything");
    },
    0,
    fast,
  );
  await waitFor(() => afters.length === 1);
  await new Promise((r) => setTimeout(r, 30));
  feed.stop();

  expect(afters).toHaveLength(1);
  expect(feed.items).toEqual([]);
  expect(feed.statuses).toEqual([]);
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
  const feed = collectBus("activity-observer-budget");

  observeConversation(
    engine,
    "Houston/Bo",
    "activity-observer-budget",
    async () => {},
    1,
    fast,
  );
  await waitFor(() => feed.statuses.includes("error"));
  feed.stop();

  expect(feed.items).toContainEqual({
    feed_type: "system_message",
    data: STREAM_LOST_MESSAGE,
  });
  expect(feed.statuses).toEqual(["running", "error"]);
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
  const feed = collectBus("activity-handoff-ok");

  observeConversation(
    engine,
    "Houston/Bo",
    "activity-handoff-ok",
    async () => {},
    1,
    fast,
  );
  await waitFor(() => afters.length === 1);
  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-handoff-ok",
    "hi",
    async () => {},
    fast,
  );
  feed.stop();

  expect(observerAborted).toBe(true);
  expect(afters).toEqual([undefined, 4]); // resumed exactly from the observer's cursor
  const texts = feed.items.filter((i) => i.feed_type === "assistant_text");
  expect(texts).toEqual([{ feed_type: "assistant_text", data: "yo" }]);
  expect(finals(feed.items)).toHaveLength(1);
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
  const feed = collectBus("activity-handoff-409");

  observeConversation(
    engine,
    "Houston/Bo",
    "activity-handoff-409",
    async () => {},
    1,
    fast,
  );
  await waitFor(() => afters.length === 1);
  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-handoff-409",
    "hi",
    async () => {},
    fast,
  );
  feed.stop();

  expect(observerAborted).toBe(false); // the live observer survived the refusal
  expect(afters).toHaveLength(1); // no second subscription was opened
  expect(feed.items).toContainEqual({
    feed_type: "system_message",
    data: "A turn is already running",
  });
  // No terminal settle while a turn demonstrably runs: no error status, no final.
  expect(feed.statuses).toEqual(["running", "running"]); // observer's + send attempt's
  expect(finals(feed.items)).toHaveLength(0);
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
  const feed = collectBus("activity-second-turn");

  const first = streamTurn(
    engine,
    "Houston/Bo",
    "activity-second-turn",
    "one",
    async () => {},
    fast,
  );
  await waitFor(() => afters.length === 1);
  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-second-turn",
    "two",
    async () => {},
    fast,
  );
  await first;
  feed.stop();

  expect(firstAborted).toBe(true);
  expect(afters).toHaveLength(2);
  expect(finals(feed.items)).toHaveLength(1); // only the second turn settled
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

  observeConversation(
    engine,
    "Houston/Bo",
    "activity-dispose",
    async () => {},
    0,
    fast,
  );
  await waitFor(() => afters.length === 1);
  disposeAllStreams();
  await waitFor(() => aborted);

  // The registry no longer holds the disposed observer: a fresh attach works.
  observeConversation(
    engine,
    "Houston/Bo",
    "activity-dispose",
    async () => {},
    0,
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

  observeConversation(
    engine,
    "Houston/Bo",
    "activity-single",
    async () => {},
    0,
    fast,
  );
  await waitFor(() => afters.length === 1);
  observeConversation(
    engine,
    "Houston/Bo",
    "activity-single",
    async () => {},
    0,
    fast,
  );
  await new Promise((r) => setTimeout(r, 30));

  expect(afters).toHaveLength(1); // the second observer never opened a stream
});
