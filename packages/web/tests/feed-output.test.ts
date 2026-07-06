import { expect, test } from "vitest";
import { bus } from "../src/engine-adapter/bus";
import { createBusFeedOutput } from "../src/engine-adapter/feed-output";

/**
 * The web adapter's bus-backed FeedOutput: it emits the exact FeedItem /
 * SessionStatus HoustonEvents app/src consumes, maps engine provider ids on the
 * two provider frames to the desktop's legacy names, and surfaces a board-status
 * persist failure in the feed (never a silent hang in "running").
 */

type BusEvent = {
  type: string;
  data?: {
    agent_path?: string;
    session_key?: string;
    item?: { feed_type?: string; data?: unknown };
    status?: string;
    error?: string;
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
    data: { provider: "openai", summarized: true, pre_tokens: 5 }, // codex → openai
  });
  expect(items[1]).toEqual({ feed_type: "assistant_text", data: "hello" });
});

test("pushFeedItem also maps the provider id on a provider_error frame", () => {
  const { events, stop } = collect();
  const out = createBusFeedOutput(async () => {});

  // provider_error carries the ENGINE id too; the desktop's provider-error card
  // resolves names against the OLD ids, so it must be remapped like the switch
  // frame — a non-identity id (openai-codex → openai) proves a real mapping.
  out.pushFeedItem("Houston/Bo", "c1", {
    feed_type: "provider_error",
    data: { provider: "openai-codex", kind: "rate_limited" },
  });
  stop();

  const item = events.find((e) => e.type === "FeedItem")?.data?.item;
  expect(item).toEqual({
    feed_type: "provider_error",
    data: { provider: "openai", kind: "rate_limited" }, // codex → openai
  });
});

test("sessionStatus emits a SessionStatus event", () => {
  const { events, stop } = collect();
  const out = createBusFeedOutput(async () => {});
  out.sessionStatus("Houston/Bo", "c1", "error", "boom");
  stop();

  const status = events.find((e) => e.type === "SessionStatus");
  expect(status?.data).toMatchObject({
    session_key: "c1",
    status: "error",
    error: "boom",
  });
});

test("persistBoardStatus forwards status + interaction to the injected setter", async () => {
  const seen: Array<[string, string, string, unknown]> = [];
  const out = createBusFeedOutput(async (a, s, status, pi) => {
    seen.push([a, s, status, pi]);
  });
  const interaction = {
    kind: "question" as const,
    question: "Which one?",
    options: [{ id: "a", label: "A" }],
  };
  // A settle carrying an interaction forwards it verbatim...
  await out.persistBoardStatus("Houston/Bo", "c1", "needs_you", interaction);
  // ...and one with no interaction (omitted) forwards `null` (the clear).
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
