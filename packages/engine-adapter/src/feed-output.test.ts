import { afterAll, afterEach, expect, test } from "vitest";
import { bus } from "./bus";
import { setAdapterErrorSink } from "./error-sink";
import { createBusFeedOutput } from "./feed-output";

/**
 * A board write that fails puts a line in the transcript only when the card
 * depends on it. The early hand-back on `reply_complete` (and its take-back)
 * is a forecast the settle's own write follows, so its failure is reported to
 * the app's error path and never shown.
 */

const reported: { source: string; error: unknown }[] = [];
const feedItems: unknown[] = [];
const off = bus.on((event) => {
  if ((event as { type?: string }).type === "FeedItem") feedItems.push(event);
});
setAdapterErrorSink((source, error) => reported.push({ source, error }));

afterEach(() => {
  reported.length = 0;
  feedItems.length = 0;
});

afterAll(() => {
  off();
  setAdapterErrorSink((source, error) => console.error(`[${source}]`, error));
});

const failing = createBusFeedOutput(async () => {
  throw new Error("PATCH /activities/m1 answered 500");
});

test("a failed early hand-back is reported, never shown", async () => {
  await failing.persistBoardStatus("a1", "sk", "needs_you", null, {
    provisional: true,
  });
  await failing.persistBoardStatus("a1", "sk", "running", null, {
    provisional: true,
  });

  expect(feedItems).toEqual([]);
  expect(reported.map((r) => r.source)).toEqual([
    "feed-output.provisional-board-status",
    "feed-output.provisional-board-status",
  ]);
  expect(String(reported[0]?.error)).toContain("answered 500");
});

test("a failed settle write still tells the person", async () => {
  await failing.persistBoardStatus("a1", "sk", "needs_you", null);

  expect(reported).toEqual([]);
  expect(feedItems).toHaveLength(1);
  expect(feedItems[0]).toMatchObject({
    data: {
      session_key: "sk",
      item: { feed_type: "system_message" },
    },
  });
});

test("the bus output carries the explicit stamp and leaves reconciliation unstamped", async () => {
  const { vi } = await import("vitest");
  const persist = vi.fn(async () => {});
  const output = createBusFeedOutput(persist);
  await output.persistBoardStatus("a1", "sk", "running", null, {
    stamp: "last_message",
  });
  await output.persistBoardStatus("a1", "sk", "needs_you", null);
  expect(persist.mock.calls).toEqual([
    ["a1", "sk", "running", null, { stamp: "last_message" }],
    ["a1", "sk", "needs_you", null, undefined],
  ]);
});
