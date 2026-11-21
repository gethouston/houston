import type { WireFrame } from "@houston/runtime-client";
import { expect, test, vi } from "vitest";
import type { FeedOutput } from "./feed-output";
import { MAX_FAILURES, PreAcceptTurn } from "./pre-accept-turn";
import { TurnSink } from "./turn-sink";

type Item = { feed_type?: string; data?: unknown };

function makeSink() {
  const items: Item[] = [];
  const statuses: string[] = [];
  const output: FeedOutput = {
    pushFeedItem: (_a, _s, item) => {
      items.push(item as Item);
    },
    sessionStatus: (_a, _s, status) => {
      statuses.push(status);
    },
    persistBoardStatus: async () => {},
  };
  const sink = new TurnSink({
    agentPath: "Houston/Bo",
    sessionKey: "activity-late",
    output,
    mode: "turn",
    nonce: "our-nonce",
    prompt: "hi",
    stop: () => {},
    reloadHistory: async () => [],
    historyGuard: () => false,
    presettledPollMs: 60_000,
  });
  return { sink, items, statuses };
}

const runningSync = (
  turnId: string,
  partial: string,
  seq = 2,
  resync = false,
): WireFrame => ({
  type: "sync",
  data: { running: true, partial, seq, turnId, ...(resync ? { resync } : {}) },
  seq,
});
const text = (turnId: string, data: string, seq: number): WireFrame => ({
  type: "text",
  data,
  turnId,
  seq,
});
const done = (turnId: string, seq: number): WireFrame => ({
  type: "done",
  data: null,
  turnId,
  seq,
});
const streamed = (items: Item[]) =>
  items.filter((i) => i.feed_type === "assistant_text_streaming");

test("a running sync that beat the 202 renders once the 202 names its turn", () => {
  const { sink, items } = makeSink();
  sink.onFrame(runningSync("t1", "Roger that. "));
  sink.onFrame(text("t1", "You said", 3));
  expect(streamed(items)).toEqual([]);

  sink.sendAccepted("t1");

  expect(sink.active).toBe(true);
  expect(streamed(items).map((i) => i.data)).toEqual([
    "Roger that. ",
    "Roger that. You said",
  ]);
  sink.onFrame(text("t1", ": hi", 4));
  sink.onFrame({ type: "done", data: null, turnId: "t1", seq: 5 });
  expect(sink.settled).toBe(true);
  expect(
    items.filter((i) => i.feed_type === "assistant_text").map((i) => i.data),
  ).toEqual(["Roger that. You said: hi"]);
});

test("a terminal frame that beat the 202 settles the claimed turn", () => {
  const { sink, items } = makeSink();
  sink.onFrame(runningSync("t1", "Roger"));
  sink.onFrame({
    type: "error",
    data: { message: "The turn ended unexpectedly" },
    turnId: "t1",
    seq: 3,
  });
  expect(sink.settled).toBe(false);

  sink.sendAccepted("t1");

  expect(sink.settled).toBe(true);
  expect(items).toContainEqual(
    expect.objectContaining({
      feed_type: "system_message",
      data: "The turn ended unexpectedly",
    }),
  );
});

test("once claimed, a later turn's resync is a boundary, never adopted", () => {
  const { sink, items } = makeSink();
  sink.onFrame(runningSync("t1", "Roger"));
  sink.sendAccepted("t1");

  sink.onFrame({
    type: "sync",
    data: { running: true, partial: "someone else", seq: 9, turnId: "t2" },
    seq: 9,
  });

  expect(streamed(items).map((i) => i.data)).toEqual(["Roger"]);
});

test("a 202 naming another turn claims nothing", () => {
  const { sink, items } = makeSink();
  sink.onFrame(runningSync("other", "not ours"));
  sink.onFrame(text("other", " either", 3));

  sink.sendAccepted("t1");

  expect(sink.active).toBe(false);
  expect(streamed(items)).toEqual([]);
});

test("a mismatched 202 does not adopt the old turn's delayed terminal", async () => {
  const { sink, items } = makeSink();
  sink.onFrame(runningSync("t-old", "not ours"));

  sink.sendAccepted("t-new");
  sink.onFrame(done("t-old", 3));
  await Promise.resolve();

  expect(sink.settled).toBe(false);
  expect(sink.active).toBe(false);
  expect(streamed(items)).toEqual([]);
});

test("a mismatched 202 adopts a later resync for its named turn", () => {
  const { sink, items } = makeSink();
  sink.onFrame(runningSync("t-old", "not ours"));

  sink.sendAccepted("t-new");
  sink.onFrame(done("t-old", 3));
  sink.onFrame(runningSync("t-new", "ours", 4, true));

  expect(sink.active).toBe(true);
  expect(streamed(items).map((i) => i.data)).toEqual(["ours"]);
});

test("a 202 that names no turn claims nothing (servers without the id)", () => {
  const { sink, items } = makeSink();
  sink.onFrame(runningSync("t1", "Roger"));

  sink.sendAccepted();

  expect(sink.active).toBe(false);
  expect(streamed(items)).toEqual([]);

  sink.onFrame(done("t1", 3));
  expect(sink.settled).toBe(true);
});

test("a newer sync replaces the kept turn", () => {
  const { sink, items } = makeSink();
  sink.onFrame(runningSync("t1", "Roger"));
  sink.onFrame({
    type: "sync",
    data: { running: false, partial: "", seq: 4 },
    seq: 4,
  });

  sink.sendAccepted("t1");

  expect(sink.active).toBe(false);
  expect(streamed(items)).toEqual([]);
});

test("a held send never claims the turn it was held behind", () => {
  const { sink, items } = makeSink();
  sink.onFrame(runningSync("t1", "the turn we wait on"));
  sink.holdSend();

  sink.sendAccepted("t2");

  expect(streamed(items)).toEqual([]);
});

test("a held retry claims a running sync that beats its 202", () => {
  const { sink, items } = makeSink();
  sink.onFrame(runningSync("t-prev", "previous"));
  sink.holdSend();
  sink.onFrame(done("t-prev", 3));
  sink.onFrame(runningSync("t-new", "partial", 4, true));

  sink.sendAccepted("t-new");
  sink.onFrame(text("t-new", " reply", 5));

  expect(streamed(items).map((i) => i.data)).toEqual([
    "partial",
    "partial reply",
  ]);
  expect(streamed(items).map((i) => i.data)).not.toContain("previous");
  sink.onFrame(done("t-new", 6));
  expect(sink.settled).toBe(true);
});

test("stop, an ambiguous send and teardown release the kept frames", () => {
  const clear = vi.spyOn(PreAcceptTurn.prototype, "clear");
  for (const end of ["mute", "sendMaybeAccepted", "dispose"] as const) {
    const { sink } = makeSink();
    sink.onFrame(runningSync("t1", "kept"));
    clear.mockClear();
    sink[end]();
    expect(clear, end).toHaveBeenCalled();
  }
  clear.mockRestore();
});

test("only the last MAX_FAILURES failures stay claimable", () => {
  const kept = new PreAcceptTurn();
  const fail = (turnId: string): WireFrame => ({
    type: "error",
    data: { message: "failed" },
    turnId,
  });
  for (let i = 0; i <= MAX_FAILURES; i++) kept.keep(fail(`t${i}`));
  expect(kept.claim("t0")).toEqual([]);
  for (let i = 1; i <= MAX_FAILURES; i++) kept.keep(fail(`t${i}`));
  expect(kept.claim(`t${MAX_FAILURES}`)).toEqual([fail(`t${MAX_FAILURES}`)]);
});
