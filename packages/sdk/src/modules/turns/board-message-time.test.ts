import type { ActivityStamp } from "@houston/protocol";
import { expect, test } from "vitest";
import { ActivityStatusOutput } from "./activity-status-output";
import { TurnBoardWrites } from "./board-writes";
import type { BoardStatus, FeedOutput } from "./feed-output";

test("turn start, reply and settle request server message stamps", async () => {
  let replyWritten = () => {};
  const reply = new Promise<void>((resolve) => {
    replyWritten = resolve;
  });
  const writes: { status: BoardStatus; stamp?: ActivityStamp }[] = [];
  const output = new ActivityStatusOutput(
    async (_agent, _session, status, _interaction, stamp) => {
      writes.push({ status, stamp });
      if (writes.length === 2) replyWritten();
    },
    { debug() {}, info() {}, warn() {}, error() {} },
  );
  const board = new TurnBoardWrites(output, "a1", "activity-m1");
  await board.persist("running", null, { stamp: "last_message" });
  board.replyPhase(true);
  await reply;
  board.settle("needs_you", null);
  await board.settled;
  expect(writes).toEqual([
    { status: "running", stamp: "last_message" },
    { status: "needs_you", stamp: "last_message" },
    { status: "needs_you", stamp: "last_message" },
  ]);
});

test("a reconciliation write has no implicit message stamp", async () => {
  const persist: Parameters<FeedOutput["persistBoardStatus"]>[] = [];
  const output: FeedOutput = {
    pushFeedItem() {},
    sessionStatus() {},
    async persistBoardStatus(...args) {
      persist.push(args);
    },
  };
  const board = new TurnBoardWrites(output, "a1", "activity-m2");
  await board.persist("needs_you", null);
  expect(persist).toEqual([
    ["a1", "activity-m2", "needs_you", null, undefined],
  ]);
});
