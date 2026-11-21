import type { ChatMessage, WireFrame } from "@houston/runtime-client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { PRESETTLED_GONE_MS } from "./stream-tuning";
import {
  idleSync,
  makeSink,
  notFound,
  setupError,
  systemLines,
} from "./turn-sink-setup-fixtures";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

test("a setup error that beats the 202 settles the turn the 202 names", async () => {
  const reload = vi.fn(notFound);
  const { sink, items, statuses, stopped } = makeSink(reload);
  sink.onFrame(idleSync);
  sink.onFrame(setupError("t1"));
  expect(sink.settled).toBe(false);

  sink.sendAccepted("t1");

  expect(sink.settled).toBe(true);
  expect(stopped()).toBe(true);
  expect(statuses).toEqual(["error"]);
  const [line] = systemLines(items);
  expect(line).toMatchObject({
    notice: "agent_too_large",
    cause: "hydrate_over_cap",
    fails_pending: true,
  });
  expect(String(line.data)).not.toContain("hydrate_over_cap");
  await vi.advanceTimersByTimeAsync(PRESETTLED_GONE_MS * 2);
  expect(reload).not.toHaveBeenCalled();
});

test("every other setup code settles with the setup-failed notice", () => {
  const { sink, items } = makeSink(notFound);
  sink.onFrame(idleSync);
  sink.onFrame(setupError("t1", "layout_unexpected"));
  sink.sendAccepted("t1");
  expect(systemLines(items)).toEqual([
    expect.objectContaining({
      notice: "agent_setup_failed",
      cause: "layout_unexpected",
    }),
  ]);
});

test("a fenced claim is no setup failure: the turn may have run, no send-again line", () => {
  const { sink, items } = makeSink(notFound);
  sink.onFrame(idleSync);
  sink.onFrame({
    type: "error",
    data: { message: "claim_fenced" },
    turnId: "t1",
    seq: 2,
  });
  sink.sendAccepted("t1");
  expect(sink.settled).toBe(true);
  const [line] = systemLines(items);
  expect(line.notice).toBeUndefined();
  expect(line.fails_pending).toBeUndefined();
});

test("a kept failure survives a reconnect's idle resync before the 202", () => {
  const { sink } = makeSink(notFound);
  sink.onFrame(idleSync);
  sink.onFrame(setupError("t1"));
  sink.onFrame({
    type: "sync",
    data: { running: false, partial: "", seq: 3, resync: true },
    seq: 3,
  });
  sink.sendAccepted("t1");
  expect(sink.settled).toBe(true);
});

test("a kept running turn's failure survives the resync that drops its frames", () => {
  const { sink, items } = makeSink(notFound);
  sink.onFrame({
    type: "sync",
    data: { running: true, partial: "Roger", seq: 1, turnId: "t1" },
    seq: 1,
  });
  sink.onFrame({
    type: "error",
    data: { message: "The turn ended unexpectedly" },
    turnId: "t1",
    seq: 2,
  });
  sink.onFrame({
    type: "sync",
    data: { running: false, partial: "", seq: 3, resync: true },
    seq: 3,
  });
  sink.sendAccepted("t1");
  expect(sink.settled).toBe(true);
  expect(systemLines(items)).toEqual([
    expect.objectContaining({ data: "The turn ended unexpectedly" }),
  ]);
});

test("a held send's setup error that beats its 202 is still claimed", () => {
  const { sink } = makeSink(notFound);
  sink.onFrame(idleSync);
  sink.holdSend();
  sink.onFrame(setupError("t-resend"));
  sink.sendAccepted("t-resend");
  expect(sink.settled).toBe(true);
});

test("another turn's failure is never claimed by a 202 naming ours", () => {
  const { sink, items } = makeSink(notFound);
  sink.onFrame(idleSync);
  sink.onFrame(setupError("someone-else"));
  sink.sendAccepted("t1");
  expect(sink.settled).toBe(false);
  expect(systemLines(items)).toEqual([]);
  sink.dispose();
});

test("stop, an ambiguous send and teardown drop the kept failures", () => {
  for (const end of ["mute", "sendMaybeAccepted", "dispose"] as const) {
    const { sink, items } = makeSink(notFound);
    sink.onFrame(idleSync);
    sink.onFrame(setupError("t1"));
    sink[end]();
    sink.sendAccepted("t1");
    expect(systemLines(items), end).toEqual([]);
    sink.dispose();
  }
});

test("a bare done before the 202 is not claimed: the reply comes from history", async () => {
  const reply: ChatMessage = {
    role: "assistant",
    content: "Here you go",
    ts: 2,
    turnId: "t1",
  } as ChatMessage;
  const reload = vi.fn(async () => [
    { role: "user", content: "hi", ts: 1, turnId: "t1" } as ChatMessage,
    reply,
  ]);
  const { sink, items } = makeSink(reload);
  sink.onFrame(idleSync);
  sink.onFrame({ type: "done", data: null, turnId: "t1", seq: 2 } as WireFrame);

  sink.sendAccepted("t1");
  expect(sink.settled).toBe(false);

  await vi.advanceTimersByTimeAsync(2_000);
  expect(sink.settled).toBe(true);
  expect(
    items.filter((i) => i.feed_type === "assistant_text").map((i) => i.data),
  ).toEqual(["Here you go"]);
});
