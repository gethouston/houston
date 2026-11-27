import type { ChatMessage, WireFrame } from "@houston/runtime-client";
import type { UnsavedFilesReport } from "@houston/wire-types";
import { expect, test } from "vitest";
import { ScopeStore } from "../../store";
import { historyToFeed } from "./history";
import { settleFromHistory } from "./settle-from-history";
import { applyTurnFrame } from "./turn-frames";
import { turnFailureReport } from "./turn-notices";
import { newTurnState } from "./turn-state";
import { FILES_NOT_SAVED_MESSAGE } from "./turn-unsaved-notice";
import {
  type ConversationVM,
  ConversationVmOutput,
  conversationScope,
} from "./vm-output";

const report: UnsavedFilesReport = {
  files: [
    {
      path: "notes.md",
      reason: "conflict_copy",
      copyPath: "notes (conflict 2026-11-22).md",
    },
    { path: ".houston/activity/activity.json", reason: "conflict" },
    { path: "data/sessions/c/x.json", reason: "too_large", internal: true },
  ],
  total: 3,
  counts: { conflict_copy: 1, conflict: 1, too_large: 1 },
};

const visible = {
  unsavedFiles: { ...report, files: [report.files[0]] },
};

function live(frame: WireFrame) {
  const store = new ScopeStore();
  const output = new ConversationVmOutput(store);
  const state = newTurnState("a", "c", output);
  state.turnId = "t";
  applyTurnFrame(state, frame, () => {});
  const vm = store.getSnapshot(conversationScope("a", "c")) as ConversationVM;
  return { vm, output, store };
}

const notices = (vm: ConversationVM) =>
  vm.feed.filter((f) => f.notice === "files_not_saved");

test("a done frame's unsaved files become one notice after the reply", () => {
  const { vm } = live({
    type: "done",
    turnId: "t",
    data: { unsavedFiles: report },
  } as unknown as WireFrame);
  const [notice] = notices(vm);
  expect(notice).toMatchObject({
    feed_type: "system_message",
    data: `${FILES_NOT_SAVED_MESSAGE} notes.md`,
    noticeData: visible,
    turnId: "t",
  });
  expect(vm.feed.at(-1)).toBe(notice);
});

test("an error frame that carries unsaved files shows them too", () => {
  const { vm } = live({
    type: "error",
    turnId: "t",
    data: { message: "provider down", unsavedFiles: report },
  } as unknown as WireFrame);
  expect(notices(vm)).toHaveLength(1);
});

test.each([
  ["no field", null],
  [
    "only files the person never sees",
    {
      unsavedFiles: {
        files: [report.files[1], report.files[2]],
        total: 2,
        counts: {},
      },
    },
  ],
])("%s shows no notice", (_name, data) => {
  const { vm } = live({ type: "done", turnId: "t", data } as WireFrame);
  expect(notices(vm)).toEqual([]);
});

const messages: ChatMessage[] = [
  { role: "user", content: "edit", ts: 1, turnId: "t" },
  {
    role: "assistant",
    content: "Edited",
    ts: 2,
    turnId: "t",
    unsavedFiles: report,
  },
];

test("a reload replays the notice from the saved reply", () => {
  expect(historyToFeed(messages)).toContainEqual({
    feed_type: "system_message",
    notice: "files_not_saved",
    data: `${FILES_NOT_SAVED_MESSAGE} notes.md`,
    noticeData: visible,
    ts: 2,
    turnId: "t",
  });
});

test("a seeded notice and the live one fold into one entry", () => {
  const store = new ScopeStore();
  const output = new ConversationVmOutput(store);
  output.seedHistory("a", "c", historyToFeed(messages));
  const state = newTurnState("a", "c", output);
  state.turnId = "t";
  applyTurnFrame(
    state,
    { type: "done", turnId: "t", data: { unsavedFiles: report } } as never,
    () => {},
  );
  const vm = store.getSnapshot(conversationScope("a", "c")) as ConversationVM;
  expect(notices(vm)).toHaveLength(1);
  expect(notices(vm)[0]?.noticeData).toEqual(visible);
});

test("a settle from history after a lost terminal shows the notice", () => {
  const store = new ScopeStore();
  const output = new ConversationVmOutput(store);
  const state = newTurnState("a", "c", output);
  settleFromHistory(state, messages, "t", () => true);
  const vm = store.getSnapshot(conversationScope("a", "c")) as ConversationVM;
  expect(notices(vm)).toHaveLength(1);
});

test("a live notice and a later history settle report once", () => {
  const pushed: unknown[] = [];
  const output = new ConversationVmOutput(new ScopeStore());
  const forward = output.pushFeedItem.bind(output);
  output.pushFeedItem = (agentPath, sessionKey, item) => {
    pushed.push(item);
    forward(agentPath, sessionKey, item);
  };
  const state = newTurnState("a", "c", output);
  state.turnId = "t";
  applyTurnFrame(
    state,
    {
      type: "done",
      data: { unsavedFiles: report },
      turnId: "t",
    } as unknown as WireFrame,
    () => {},
  );
  settleFromHistory(state, messages, "t", () => true);
  expect(
    pushed.filter((item) => turnFailureReport(item) !== null),
  ).toHaveLength(1);
});

test("the notice reports reasons and counts, never file names", () => {
  const item = {
    feed_type: "system_message",
    notice: "files_not_saved",
    data: "x",
    noticeData: visible,
    turnId: "t",
  };
  const reported = turnFailureReport(item, "c");
  expect(reported?.source).toBe("turn_files_not_saved");
  expect(reported?.error.message).toBe(
    "turn files not saved: conflict,conflict_copy,too_large",
  );
  expect(reported?.error).toMatchObject({
    unsavedCounts: report.counts,
    unsavedTotal: 3,
    turnId: "t",
  });
  expect(JSON.stringify(reported?.error)).not.toContain("notes");
});

test("the notice's turn and counts ride as report tags, never file names", () => {
  const reported = turnFailureReport(
    {
      feed_type: "system_message",
      notice: "files_not_saved",
      data: "x",
      noticeData: visible,
      turnId: "t",
    },
    "c",
  );
  expect(reported?.tags).toEqual({
    turn_id: "t",
    unsaved_total: "3",
    unsaved_conflict: "1",
    unsaved_conflict_copy: "1",
    unsaved_too_large: "1",
  });
});

test("an unknown reason in the counts rides as no tag", () => {
  const reported = turnFailureReport({
    feed_type: "system_message",
    notice: "files_not_saved",
    data: "x",
    noticeData: {
      unsavedFiles: { counts: { conflict: 1, "notes.md": 1 }, total: 2 },
    },
  });
  expect(reported?.tags).toEqual({ unsaved_total: "2", unsaved_conflict: "1" });
});

test("a malformed saved report replays nothing instead of throwing", () => {
  const broken = [
    messages[0],
    { ...messages[1], unsavedFiles: { files: "x", total: 1 } },
  ] as ChatMessage[];
  expect(() => historyToFeed(broken)).not.toThrow();
  expect(
    historyToFeed(broken).filter((f) => f.notice === "files_not_saved"),
  ).toEqual([]);
});
