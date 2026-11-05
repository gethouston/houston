import { expect, test } from "vitest";
import { isRoutineConversation } from "./routine-context";

test("routine chats are recognised by their conversation id alone", () => {
  expect(isRoutineConversation("routine-abc")).toBe(true);
  expect(isRoutineConversation("routine-abc-run-1")).toBe(true);
  expect(isRoutineConversation("ROUTINE-abc")).toBe(true);
  expect(isRoutineConversation("activity-abc")).toBe(false);
  expect(isRoutineConversation("chat-1")).toBe(false);
});
