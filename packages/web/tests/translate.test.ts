import { bus } from "@houston/engine-adapter/bus";
import { historyToFeed } from "@houston/engine-adapter/translate";
import { streamTurn } from "@houston/engine-adapter/turn-stream";
import type {
  ChatMessage,
  HoustonEngineClient,
  WireEvent,
} from "@houston/runtime-client";
import { expect, test } from "vitest";

type FinalResult = {
  feed_type?: string;
  data?: { usage?: { context_tokens: number } | null };
};

function fakeEngine(events: WireEvent[]): HoustonEngineClient {
  return {
    async streamEvents(_id: string, opts: { onEvent: (e: WireEvent) => void }) {
      for (const ev of events) opts.onEvent(ev);
    },
    async sendMessage() {},
  } as unknown as HoustonEngineClient;
}

function collectFeed(): { items: unknown[]; stop: () => void } {
  const items: unknown[] = [];
  const off = bus.on((e) => {
    const ev = e as { type: string; data?: { item?: unknown } };
    if (ev.type === "FeedItem") items.push(ev.data?.item);
  });
  return { items, stop: off };
}

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
  expect(out.filter((i) => i.feed_type === "assistant_text")).toHaveLength(1);
});

test("historyToFeed emits no final_result when the message has no usage", () => {
  const out = historyToFeed([{ role: "assistant", content: "yo", ts: 2 }]);
  expect(out.some((i) => i.feed_type === "final_result")).toBe(false);
});

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

test("a refused not-connected send surfaces the typed reconnect card with provider + prompt", async () => {
  const statuses: string[] = [];
  const feed = collectFeed();
  const { EngineError } = await import("@houston/runtime-client");
  const engine = {
    async streamEvents() {},
    async sendMessage() {
      throw new EngineError(
        409,
        JSON.stringify({
          error: "No provider connected. Connect an AI provider first.",
        }),
      );
    },
  } as unknown as HoustonEngineClient;

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-nc",
    "hey",
    async (s) => {
      statuses.push(s);
    },
    { provider: "openai" },
  );
  feed.stop();

  const card = feed.items.find(
    (i) => (i as { feed_type?: string })?.feed_type === "provider_error",
  ) as { data?: Record<string, unknown> } | undefined;
  expect(card?.data).toEqual({
    kind: "unauthenticated",
    provider: "openai",
    cause: "no_credentials",
    message: "No provider connected. Connect an AI provider first.",
    failed_prompt: "hey",
  });
  expect(
    feed.items.some(
      (i) => (i as { feed_type?: string })?.feed_type === "system_message",
    ),
  ).toBe(false);
  expect(statuses).toEqual(["running", "needs_you"]);
});

test("isConversationNotFound: only an engine 404 reads as no-history-yet", async () => {
  const { isConversationNotFound } = await import(
    "@houston/engine-adapter/translate"
  );
  const { EngineError } = await import("@houston/runtime-client");

  expect(
    isConversationNotFound(
      new EngineError(404, '{"error":"conversation not found"}'),
    ),
  ).toBe(true);
  expect(isConversationNotFound(new EngineError(500, "boom"))).toBe(false);
  expect(isConversationNotFound(new EngineError(401, "unauthorized"))).toBe(
    false,
  );
  expect(isConversationNotFound(new TypeError("Load failed"))).toBe(false);
  expect(isConversationNotFound(undefined)).toBe(false);
});
