import type {
  ChatMessage,
  HoustonEngineClient,
  WireEvent,
} from "@houston/runtime-client";
import { expect, test } from "vitest";
import { bus } from "../src/engine-adapter/bus";
import { historyToFeed, streamTurn } from "../src/engine-adapter/translate";

type FinalResult = {
  feed_type?: string;
  data?: { usage?: { context_tokens: number } | null };
};

/**
 * A fake runtime client whose `streamEvents` replays a fixed list of wire events
 * synchronously, then closes. `sendMessage` is a no-op. Enough to drive one turn
 * through `streamTurn` without a real engine.
 */
function fakeEngine(events: WireEvent[]): HoustonEngineClient {
  return {
    async streamEvents(_id: string, opts: { onEvent: (e: WireEvent) => void }) {
      for (const ev of events) opts.onEvent(ev);
    },
    async sendMessage() {},
  } as unknown as HoustonEngineClient;
}

/** Collect every feed item the turn emits on the in-process bus. */
function collectFeed(): { items: unknown[]; stop: () => void } {
  const items: unknown[] = [];
  const off = bus.on((e) => {
    const ev = e as { type: string; data?: { item?: unknown } };
    if (ev.type === "FeedItem") items.push(ev.data?.item);
  });
  return { items, stop: off };
}

// THE REGRESSION: a completed turn's board status must reach the injected
// (cloud-aware) setter — NOT a localStorage write the board never reads. Before
// the fix, `done` flipped the card to needs_you in localStorage while the board
// read the host, so the card hung in "running" forever.
test("a completed turn drives the activity setter running -> needs_you", async () => {
  const statuses: string[] = [];
  const setStatus = async (s: string) => {
    statuses.push(s);
  };
  const feed = collectFeed();

  await streamTurn(
    fakeEngine([
      { type: "text", data: "ok" },
      { type: "done", data: null },
    ]),
    "Houston/Bo",
    "activity-abc",
    "hi",
    setStatus,
  );
  feed.stop();

  expect(statuses).toEqual(["running", "needs_you"]);
  // The agent's text reached the feed as a final result (the turn really ran).
  expect(
    feed.items.some(
      (i) => (i as { feed_type?: string })?.feed_type === "final_result",
    ),
  ).toBe(true);
});

test("an errored turn drives the activity setter running -> error", async () => {
  const statuses: string[] = [];
  const setStatus = async (s: string) => {
    statuses.push(s);
  };

  await streamTurn(
    fakeEngine([{ type: "error", data: { message: "boom" } }]),
    "Houston/Bo",
    "activity-abc",
    "hi",
    setStatus,
  );

  expect(statuses).toEqual(["running", "error"]);
});

// The context-usage indicator's data path: a `usage` frame (emitted before
// `done`) must ride along on the turn's `final_result`. Before this, the new
// engine dropped usage entirely and the indicator was permanently empty.
test("a turn's usage frame is attached to the final_result", async () => {
  const feed = collectFeed();

  await streamTurn(
    fakeEngine([
      { type: "text", data: "hello" },
      {
        type: "usage",
        data: { context_tokens: 1234, output_tokens: 56, cached_tokens: 78 },
      },
      { type: "done", data: null },
    ]),
    "Houston/Bo",
    "activity-usage",
    "hi",
    async () => {},
  );
  feed.stop();

  const final = feed.items.find(
    (i) => (i as FinalResult)?.feed_type === "final_result",
  ) as FinalResult | undefined;
  expect(final?.data?.usage?.context_tokens).toBe(1234);
});

test("a turn with no usage frame yields a null final_result usage", async () => {
  const feed = collectFeed();

  await streamTurn(
    fakeEngine([
      { type: "text", data: "x" },
      { type: "done", data: null },
    ]),
    "Houston/Bo",
    "activity-nousage",
    "hi",
    async () => {},
  );
  feed.stop();

  const final = feed.items.find(
    (i) => (i as FinalResult)?.feed_type === "final_result",
  ) as FinalResult | undefined;
  expect(final?.data?.usage ?? null).toBeNull();
});

test("historyToFeed replays persisted usage as a final_result, once, with no extra bubble", () => {
  const messages: ChatMessage[] = [
    { role: "user", content: "hi", ts: 1 },
    {
      role: "assistant",
      content: "yo",
      ts: 2,
      usage: { context_tokens: 999, output_tokens: 10, cached_tokens: 5 },
    },
  ];

  const out = historyToFeed(messages);

  const final = out.find((i) => i.feed_type === "final_result") as
    | FinalResult
    | undefined;
  expect(final?.data?.usage?.context_tokens).toBe(999);
  // The assistant text still renders exactly once; final_result only flushes.
  expect(out.filter((i) => i.feed_type === "assistant_text")).toHaveLength(1);
});

test("historyToFeed emits no final_result when the message has no usage", () => {
  const out = historyToFeed([{ role: "assistant", content: "yo", ts: 2 }]);
  expect(out.some((i) => i.feed_type === "final_result")).toBe(false);
});

// A failing persist must surface (a feed system_message), never be swallowed —
// the beta no-silent-failure rule.
test("a failing status persist surfaces in the feed, not silently", async () => {
  const setStatus = async (s: string) => {
    if (s === "needs_you") throw new Error("host unreachable");
  };
  const feed = collectFeed();

  await streamTurn(
    fakeEngine([{ type: "done", data: null }]),
    "Houston/Bo",
    "activity-abc",
    "hi",
    setStatus,
  );
  feed.stop();

  const surfaced = feed.items.some((i) => {
    const it = i as { feed_type?: string; data?: string };
    return (
      it?.feed_type === "system_message" &&
      typeof it.data === "string" &&
      it.data.includes("board status")
    );
  });
  expect(surfaced).toBe(true);
});
