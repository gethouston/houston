import type { WireFrame } from "@houston/runtime-client";
import { afterEach, expect, test, vi } from "vitest";
import { ScopeStore } from "../../store";
import { TurnBoardWrites } from "./board-writes";
import { MultiplexFeedOutput } from "./feed-output";
import { noticeEndsTurn } from "./notice-ends-turn";
import { turnFailureReport } from "./turn-notices";
import { TurnSink } from "./turn-sink";
import {
  type ConversationVM,
  ConversationVmOutput,
  conversationScope,
} from "./vm-output";

const MESSAGE = "gateway copy may change";

function harness(mode: "turn" | "observer" = "turn") {
  const store = new ScopeStore();
  const vm = new ConversationVmOutput(store);
  const status = vi.fn();
  const stop = vi.fn();
  const output = new MultiplexFeedOutput([
    vm,
    {
      pushFeedItem: () => {},
      sessionStatus: status,
      persistBoardStatus: async () => {},
    },
  ]);
  const board = new TurnBoardWrites(output, "a", "c");
  const sink = new TurnSink({
    board,
    agentPath: "a",
    sessionKey: "c",
    mode,
    output,
    stop,
    reloadHistory: async () => [],
    historyGuard: () => false,
    presettledPollMs: 1_500,
  });
  vm.sessionStatus("a", "c", "running");
  if (mode === "turn") sink.sendAccepted("t1");
  sink.onFrame({
    type: "sync",
    data: { running: true, partial: "Saved work", seq: 1, turnId: "t1" },
    seq: 1,
  });
  return {
    sink,
    board,
    status,
    stop,
    snap: () =>
      store.getSnapshot(conversationScope("a", "c")) as ConversationVM,
  };
}

const terminal = (code?: string): WireFrame => ({
  type: "error",
  data: { message: MESSAGE, ...(code === undefined ? {} : { code }) },
  turnId: "t1",
  seq: 2,
});

afterEach(() => vi.useRealTimers());

for (const mode of ["turn", "observer"] as const) {
  test(`${mode}: the four-hour ceiling ends the reply with a typed expected notice`, async () => {
    const { sink, snap, status, stop, board } = harness(mode);
    sink.onFrame(terminal("turn_time_limit"));
    await board.settled;

    expect(snap().sessionStatus).toBe("completed");
    expect(snap().boardStatus).toBe("needs_you");
    expect(snap().running).toBe(false);
    expect(snap().pendingInteraction).toBeNull();
    expect(snap().feed.map((item) => item.feed_type)).toEqual([
      "assistant_text",
      "system_message",
      "final_result",
    ]);
    const notice = snap().feed[1];
    expect(notice).toMatchObject({ notice: "turn_time_limit", turnId: "t1" });
    expect(notice?.data).not.toBe(MESSAGE);
    expect(turnFailureReport(notice, "c")).toBeNull();
    expect(status.mock.calls.at(-1)).toEqual([
      "a",
      "c",
      "completed",
      undefined,
      {
        origin: mode === "turn" ? "sent" : "observed",
        stopReason: "turn_time_limit",
      },
    ]);
    expect(sink.settled).toBe(true);
    expect(stop).toHaveBeenCalled();
    sink.onFrame(terminal("turn_time_limit"));
    expect(
      snap().feed.filter((item) => item.feed_type === "system_message"),
    ).toHaveLength(1);
    expect(noticeEndsTurn(notice?.notice)).toBe(true);
    sink.dispose();
  });
}

for (const code of [undefined, "future_unknown_code"]) {
  test(`an error with ${code ?? "no code"} keeps the existing failure behavior`, async () => {
    const { sink, snap, status, board } = harness();
    sink.onFrame(terminal(code));
    await board.settled;
    expect(snap().sessionStatus).toBe("error");
    expect(snap().boardStatus).toBe("error");
    expect(snap().feed.at(-1)).toMatchObject({
      feed_type: "system_message",
      data: MESSAGE,
    });
    expect(snap().feed.at(-1)?.notice).toBeUndefined();
    expect(status.mock.calls.at(-1)).toEqual([
      "a",
      "c",
      "error",
      MESSAGE,
      { origin: "sent", errorClass: "engine_verdict" },
    ]);
    sink.dispose();
  });
}

test("another turn's ceiling never becomes our reply's notice", () => {
  const { sink, snap } = harness();
  sink.onFrame({ ...terminal("turn_time_limit"), turnId: "other" });
  expect(snap().feed.some((item) => item.feed_type === "system_message")).toBe(
    false,
  );
  sink.dispose();
});

test("an active reply can run for four hours without a client timer settling it", async () => {
  vi.useFakeTimers();
  const { sink, snap } = harness();
  await vi.advanceTimersByTimeAsync(4 * 60 * 60_000);
  expect(sink.settled).toBe(false);
  expect(snap().running).toBe(true);
  sink.onFrame(terminal("turn_time_limit"));
  expect(snap().sessionStatus).toBe("completed");
  sink.dispose();
});

test.each([
  "turn",
  "observer",
] as const)("%s: a forced ceiling stop settles ok with an unsaved notice and no app-error report", async (mode) => {
  const { sink, snap, status, board } = harness(mode);
  sink.onFrame(terminal("turn_time_limit_unsaved"));
  await board.settled;
  expect(snap().sessionStatus).toBe("completed");
  expect(snap().boardStatus).toBe("needs_you");
  expect(snap().pendingInteraction).toBeNull();
  const notice = snap().feed.find(
    (item) => item.feed_type === "system_message",
  );
  expect(notice).toMatchObject({
    notice: "turn_time_limit_unsaved",
    turnId: "t1",
  });
  expect(notice?.data).toContain("last saved point");
  expect(turnFailureReport(notice, "c")).toBeNull();
  expect(status.mock.calls.at(-1)?.[4]).toMatchObject({
    stopReason: "turn_time_limit_unsaved",
  });
  sink.dispose();
});
