import type { ChatMessage } from "@houston/runtime-client";
import { expect, test } from "vitest";
import { ScopeStore } from "../../store";
import { TurnBoardWrites } from "./board-writes";
import { historyToFeed } from "./history";
import { settleFromHistory } from "./settle-from-history";
import { applyTurnFrame } from "./turn-frames";
import { TURN_TIME_LIMIT_MESSAGE } from "./turn-notices";
import { newTurnState } from "./turn-state";
import {
  type ConversationVM,
  ConversationVmOutput,
  conversationScope,
} from "./vm-output";

const messages: ChatMessage[] = [
  { role: "user", content: "work", ts: 1, turnId: "t" },
  {
    role: "assistant",
    content: "Saved work",
    ts: 2,
    turnId: "t",
    stopReason: "turn_time_limit",
  },
];

test("history reload replays the saved reply and typed time-limit notice", () => {
  expect(historyToFeed(messages)).toContainEqual({
    feed_type: "system_message",
    notice: "turn_time_limit",
    data: TURN_TIME_LIMIT_MESSAGE,
    ts: 2,
    turnId: "t",
  });
});

test.each([
  "t",
  undefined,
])("a reconnect missing the terminal settles from its saved time-limit row (id=%s)", async (turnId) => {
  const store = new ScopeStore();
  const output = new ConversationVmOutput(store);
  const board = new TurnBoardWrites(output, "a", "c");
  const state = newTurnState("a", "c", output, { board });
  settleFromHistory(state, messages, turnId, () => true);
  await board.settled;
  const vm = store.getSnapshot(conversationScope("a", "c")) as ConversationVM;
  expect(vm.sessionStatus).toBe("completed");
  expect(vm.boardStatus).toBe("needs_you");
  expect(vm.pendingInteraction).toBeNull();
  expect(vm.feed).toContainEqual(
    expect.objectContaining({
      notice: "turn_time_limit",
      data: TURN_TIME_LIMIT_MESSAGE,
    }),
  );
  expect(vm.feed).toContainEqual(
    expect.objectContaining({
      feed_type: "assistant_text",
      data: "Saved work",
    }),
  );
});

test.each([
  "seed then live",
  "live then replay",
])("time-limit notice upserts by turn and kind: %s", (order) => {
  const store = new ScopeStore();
  const output = new ConversationVmOutput(store);
  const live = () => {
    const state = newTurnState("a", "c", output);
    state.turnId = "t";
    applyTurnFrame(
      state,
      {
        type: "error",
        turnId: "t",
        data: { code: "turn_time_limit", message: "limit" },
      },
      () => {},
    );
  };
  if (order === "seed then live")
    output.seedHistory("a", "c", historyToFeed(messages));
  live();
  if (order === "live then replay") live();
  const vm = store.getSnapshot(conversationScope("a", "c")) as ConversationVM;
  expect(vm.feed.filter((f) => f.notice === "turn_time_limit")).toHaveLength(1);
  output.pushFeedItem("a", "c", {
    feed_type: "system_message",
    turnId: "t",
    notice: "engine_restart",
    data: "restart",
  });
  output.pushFeedItem("a", "c", {
    feed_type: "system_message",
    turnId: "another",
    notice: "turn_time_limit",
    data: "limit",
  });
  const next = store.getSnapshot(conversationScope("a", "c")) as ConversationVM;
  expect(
    next.feed.filter((f) => f.feed_type === "system_message"),
  ).toHaveLength(3);
});

test("history and reconnect preserve the worker-written unsaved ceiling row", () => {
  const workerUnsaved: ChatMessage[] = messages.map((m) =>
    m.role === "assistant"
      ? { ...m, stopReason: "turn_time_limit_unsaved" }
      : m,
  );
  const store = new ScopeStore();
  const output = new ConversationVmOutput(store);
  output.seedHistory("a", "c", historyToFeed(workerUnsaved));
  const state = newTurnState("a", "c", output);
  settleFromHistory(state, workerUnsaved, "t", () => true);
  const vm = store.getSnapshot(conversationScope("a", "c")) as ConversationVM;
  expect(vm.sessionStatus).toBe("completed");
  const notices = vm.feed.filter((f) => f.feed_type === "system_message");
  expect(notices).toHaveLength(1);
  expect(notices[0]).toMatchObject({ notice: "turn_time_limit_unsaved" });
  expect(notices[0]?.data).toContain("last saved point");
});

test.each([
  ["turn_time_limit", "turn_time_limit_unsaved"],
  ["turn_time_limit_unsaved", "turn_time_limit"],
] as const)("reloading %s then replaying %s keeps only the latest per-turn notice", (seed, latest) => {
  const store = new ScopeStore();
  const output = new ConversationVmOutput(store);
  output.seedHistory(
    "a",
    "c",
    historyToFeed(
      messages.map((m) =>
        m.role === "assistant" ? { ...m, stopReason: seed } : m,
      ),
    ),
  );
  const state = newTurnState("a", "c", output);
  state.turnId = "t";
  applyTurnFrame(
    state,
    { type: "error", turnId: "t", data: { code: latest, message: "limit" } },
    () => {},
  );
  const vm = store.getSnapshot(conversationScope("a", "c")) as ConversationVM;
  expect(vm.feed.filter((f) => f.feed_type === "system_message")).toEqual([
    expect.objectContaining({ notice: latest, turnId: "t" }),
  ]);
});
