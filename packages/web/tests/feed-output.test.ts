import { setAdapterErrorSink } from "@houston/engine-adapter";
import { bus } from "@houston/engine-adapter/bus";
import { createBusFeedOutput } from "@houston/engine-adapter/feed-output";
import { expect, test } from "vitest";

type BusEvent = {
  type: string;
  data?: {
    agent_path?: string;
    session_key?: string;
    item?: { feed_type?: string; data?: unknown };
    status?: string;
    error?: string;
    error_class?: string;
    origin?: string;
  };
};

function collect() {
  const events: BusEvent[] = [];
  const off = bus.on((e) => events.push(e as BusEvent));
  return { events, stop: off };
}

test("pushFeedItem emits a FeedItem and maps the provider id on a provider frame", () => {
  const { events, stop } = collect();
  const out = createBusFeedOutput(async () => {});

  out.pushFeedItem("Houston/Bo", "c1", {
    feed_type: "provider_switched",
    data: { provider: "openai-codex", summarized: true, pre_tokens: 5 },
  });
  out.pushFeedItem("Houston/Bo", "c1", {
    feed_type: "assistant_text",
    data: "hello",
  });
  stop();

  const items = events
    .filter((e) => e.type === "FeedItem")
    .map((e) => e.data?.item);
  expect(items[0]).toEqual({
    feed_type: "provider_switched",
    data: { provider: "openai", summarized: true, pre_tokens: 5 },
  });
  expect(items[1]).toEqual({ feed_type: "assistant_text", data: "hello" });
});

test("pushFeedItem also maps the provider id on a provider_error frame", () => {
  const { events, stop } = collect();
  const out = createBusFeedOutput(async () => {});

  out.pushFeedItem("Houston/Bo", "c1", {
    feed_type: "provider_error",
    data: { provider: "openai-codex", kind: "rate_limited" },
  });
  stop();

  const item = events.find((e) => e.type === "FeedItem")?.data?.item;
  expect(item).toEqual({
    feed_type: "provider_error",
    data: { provider: "openai", kind: "rate_limited" },
  });
});

test("sessionStatus emits a SessionStatus event", () => {
  const { events, stop } = collect();
  const out = createBusFeedOutput(async () => {});
  out.sessionStatus("Houston/Bo", "c1", "error", "boom");
  stop();

  const status = events.find((e) => e.type === "SessionStatus");
  expect(status?.data).toEqual({
    agent_path: "Houston/Bo",
    session_key: "c1",
    status: "error",
    error: "boom",
  });
});

test("sessionStatus carries the SDK's error class and origin when stamped", () => {
  const { events, stop } = collect();
  const out = createBusFeedOutput(async () => {});
  out.sessionStatus(
    "Houston/Bo",
    "c1",
    "error",
    "The turn ended unexpectedly",
    {
      origin: "observed",
      errorClass: "turn_died",
    },
  );
  out.sessionStatus("Houston/Bo", "c1", "completed", undefined, {
    origin: "sent",
  });
  stop();

  const [failed, completed] = events.filter((e) => e.type === "SessionStatus");
  expect(failed?.data).toEqual({
    agent_path: "Houston/Bo",
    session_key: "c1",
    status: "error",
    error: "The turn ended unexpectedly",
    error_class: "turn_died",
    origin: "observed",
  });
  expect(completed?.data).toEqual({
    agent_path: "Houston/Bo",
    session_key: "c1",
    status: "completed",
    error: undefined,
    origin: "sent",
  });
});

test("persistBoardStatus forwards status + interaction to the injected setter", async () => {
  const seen: Array<[string, string, string, unknown]> = [];
  const out = createBusFeedOutput(async (a, s, status, pi) => {
    seen.push([a, s, status, pi]);
  });
  const interaction = {
    steps: [
      {
        kind: "question" as const,
        id: "q1",
        question: "Which one?",
        options: [{ id: "a", label: "A" }],
      },
    ],
  };
  await out.persistBoardStatus("Houston/Bo", "c1", "needs_you", interaction);
  await out.persistBoardStatus("Houston/Bo", "c1", "done");
  expect(seen).toEqual([
    ["Houston/Bo", "c1", "needs_you", interaction],
    ["Houston/Bo", "c1", "done", null],
  ]);
});

test("a failing board persist surfaces in the feed, not silently", async () => {
  const { events, stop } = collect();
  const out = createBusFeedOutput(async () => {
    throw new Error("host unreachable");
  });
  await out.persistBoardStatus("Houston/Bo", "c1", "needs_you");
  stop();

  const surfaced = events.some((e) => {
    const it = e.data?.item;
    return (
      e.type === "FeedItem" &&
      it?.feed_type === "system_message" &&
      typeof it.data === "string" &&
      it.data.includes("board status")
    );
  });
  expect(surfaced).toBe(true);
});

function engineError(status: number, reason: string): Error {
  const err = new Error(`${reason} (engine error ${status})`) as Error & {
    status: number;
  };
  err.name = "HoustonEngineError";
  err.status = status;
  return err;
}

function systemMessages(events: BusEvent[]): unknown[] {
  return events
    .filter(
      (e) =>
        e.type === "FeedItem" && e.data?.item?.feed_type === "system_message",
    )
    .map((e) => e.data?.item?.data);
}

test("a waking 502/503 on the board persist stays out of the feed", async () => {
  const { events, stop } = collect();
  const out = createBusFeedOutput(async (_a, _s, status) => {
    if (status === "running") throw engineError(502, "engine proxy failed");
    throw engineError(503, "engine unavailable");
  });
  await out.persistBoardStatus("Houston/Bo", "c1", "running");
  await out.persistBoardStatus("Houston/Bo", "c1", "needs_you");
  stop();

  expect(systemMessages(events)).toEqual([]);
});

test("a transport failure on the board persist stays out of the feed", async () => {
  const { events, stop } = collect();
  const out = createBusFeedOutput(async () => {
    throw new TypeError("Load failed");
  });
  await out.persistBoardStatus("Houston/Bo", "c1", "running");
  stop();

  expect(systemMessages(events)).toEqual([]);
});

test("a non-waking 502 on the board persist still surfaces in the feed", async () => {
  const { events, stop } = collect();
  const out = createBusFeedOutput(async () => {
    throw engineError(502, "agent pod unusable");
  });
  await out.persistBoardStatus("Houston/Bo", "c1", "running");
  stop();

  expect(systemMessages(events)).toHaveLength(1);
});

test("a turn that failed before it could start is reported by cause, its line still emitted", () => {
  const reports: Array<{ source: string; error: unknown }> = [];
  setAdapterErrorSink((source, error) => reports.push({ source, error }));
  const { events, stop } = collect();
  const out = createBusFeedOutput(async () => {});

  out.pushFeedItem("Houston/Bo", "c1", {
    feed_type: "system_message",
    data: "Your agent couldn't get ready for this message.",
    notice: "agent_setup_failed",
    cause: "layout_unexpected",
    turnId: "t1",
  });
  out.pushFeedItem("Houston/Bo", "c1", {
    feed_type: "system_message",
    data: "We couldn't confirm your agent got this message.",
    notice: "turn_unconfirmed",
    cause: "gone",
    turnId: "t2",
  });
  out.pushFeedItem("Houston/Bo", "c1", {
    feed_type: "system_message",
    data: "Your agent had to restart.",
    notice: "engine_restart",
  });
  stop();
  setAdapterErrorSink((source, error) => console.error(`[${source}]`, error));

  expect(reports.map((r) => r.source)).toEqual([
    "turn_setup_failed",
    "turn_gone_after_accept",
  ]);
  expect(String(reports[0].error)).toContain("layout_unexpected");
  expect(reports[0].error).toMatchObject({ turnId: "t1", sessionKey: "c1" });
  expect(reports[1].error).toMatchObject({ turnId: "t2", sessionKey: "c1" });
  expect(events.filter((e) => e.type === "FeedItem")).toHaveLength(3);
});
