import type { ChatMessage } from "@houston/runtime-client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { noticeEndsTurn } from "./notice-ends-turn";
import {
  PRESETTLED_GONE_MAX_POLL_MS,
  PRESETTLED_GONE_MS,
} from "./stream-tuning";
import { TURN_UNCONFIRMED_MESSAGE } from "./turn-notices";
import {
  idleSync,
  makeSink,
  notFound,
  POLL_MS,
  systemLines,
} from "./turn-sink-setup-fixtures";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

test("a conversation still not found long after the 202 settles as lost, then polls no more", async () => {
  const reload = vi.fn(notFound);
  const { sink, items, stopped } = makeSink(reload);
  sink.onFrame(idleSync);
  sink.sendAccepted("t1");

  await vi.advanceTimersByTimeAsync(PRESETTLED_GONE_MS - POLL_MS);
  expect(sink.settled).toBe(false);
  expect(reload.mock.calls.length).toBeLessThan(
    PRESETTLED_GONE_MS / POLL_MS / 4,
  );
  await vi.advanceTimersByTimeAsync(PRESETTLED_GONE_MAX_POLL_MS * 2);
  expect(sink.settled).toBe(true);
  expect(stopped()).toBe(true);
  const [line] = systemLines(items);
  expect(line).toMatchObject({ notice: "turn_unconfirmed", cause: "gone" });
  expect(line.data).toBe(TURN_UNCONFIRMED_MESSAGE);
  expect(noticeEndsTurn("turn_unconfirmed")).toBe(true);
  expect(line.fails_pending).toBeUndefined();
  const calls = reload.mock.calls.length;
  await vi.advanceTimersByTimeAsync(PRESETTLED_GONE_MS * 4);
  expect(reload.mock.calls.length).toBe(calls);
});

test("a live frame after the 202 stops the not-found clock", async () => {
  const reload = vi.fn(notFound);
  const { sink, items } = makeSink(reload);
  sink.onFrame(idleSync);
  sink.sendAccepted("t1");
  await vi.advanceTimersByTimeAsync(PRESETTLED_GONE_MS / 2);
  sink.onFrame({ type: "text", data: "Working", turnId: "t1", seq: 2 });
  const calls = reload.mock.calls.length;

  await vi.advanceTimersByTimeAsync(PRESETTLED_GONE_MS * 2);
  expect(reload.mock.calls.length).toBe(calls);
  expect(systemLines(items)).toEqual([]);
  expect(sink.settled).toBe(false);
  sink.dispose();
});

test("a not found that turns into a history restarts the bound", async () => {
  let gone = true;
  const reload = vi.fn(() =>
    gone ? notFound() : Promise.resolve([] as ChatMessage[]),
  );
  const { sink } = makeSink(reload);
  sink.onFrame(idleSync);
  sink.sendAccepted("t1");
  await vi.advanceTimersByTimeAsync(PRESETTLED_GONE_MS - POLL_MS);
  gone = false;
  await vi.advanceTimersByTimeAsync(PRESETTLED_GONE_MAX_POLL_MS * 2);
  gone = true;
  await vi.advanceTimersByTimeAsync(PRESETTLED_GONE_MS / 2);
  expect(sink.settled).toBe(false);
  sink.dispose();
});

test("a reload that fails for any other reason keeps the turn waiting", async () => {
  const reload = vi.fn(() => Promise.reject(new TypeError("Load failed")));
  const { sink } = makeSink(reload);
  sink.onFrame(idleSync);
  sink.sendAccepted("t1");
  await vi.advanceTimersByTimeAsync(PRESETTLED_GONE_MS * 2);
  expect(sink.settled).toBe(false);
  sink.dispose();
});
