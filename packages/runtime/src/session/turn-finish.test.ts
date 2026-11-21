import { expect, test } from "vitest";
import { TurnFinishMarks } from "./turn-finish";

test("the closing-message mark follows the text of the CURRENT assistant message", () => {
  const marks = new TurnFinishMarks();
  expect(marks.closingMessageSeen).toBe(false);
  marks.noteAssistantMessageStart();
  marks.noteAssistantText("\n\n");
  expect(marks.closingMessageSeen).toBe(false);
  marks.noteAssistantText("Done.");
  expect(marks.closingMessageSeen).toBe(true);
  marks.noteAssistantMessageStart();
  expect(marks.closingMessageSeen).toBe(false);
  marks.noteAssistantText("Here is the result.");
  expect(marks.closingMessageSeen).toBe(true);
});

test("text never counts before the backend reported a message start", () => {
  const marks = new TurnFinishMarks();
  marks.noteAssistantText("Done.");
  expect(marks.closingMessageSeen).toBe(false);
});

test("a new message never clears the ended mark", () => {
  const marks = new TurnFinishMarks();
  marks.noteAssistantMessageStart();
  marks.noteAssistantText("Done.");
  marks.turnEndedByTool = true;
  marks.noteAssistantMessageStart();
  expect(marks.turnEndedByTool).toBe(true);
});

test("the reply completes once, on an offer opened after the closing message", () => {
  const marks = new TurnFinishMarks();
  marks.noteAssistantMessageStart();
  marks.noteAssistantText("Here is the report.");
  expect(marks.noteReplyBeat({ type: "tool_call_start", name: "Bash" })).toBe(
    false,
  );
  expect(
    marks.noteReplyBeat({
      type: "tool_call_start",
      name: "mcp__houston__suggest_actions",
    }),
  ).toBe(true);
  expect(
    marks.noteReplyBeat({ type: "tool_call_start", name: "suggest_reusable" }),
  ).toBe(false);
  expect(marks.noteReplyBeat({ type: "answer_end" })).toBe(false);
});

test("an offer opened before any closing text completes nothing (NEEDS_MESSAGE)", () => {
  const marks = new TurnFinishMarks();
  marks.noteAssistantMessageStart();
  expect(
    marks.noteReplyBeat({ type: "tool_call_start", name: "suggest_actions" }),
  ).toBe(false);
  marks.noteAssistantText("Working on it.");
  marks.noteAssistantMessageStart();
  expect(
    marks.noteReplyBeat({ type: "tool_call_start", name: "suggest_actions" }),
  ).toBe(false);
  marks.noteAssistantText("Done.");
  expect(
    marks.noteReplyBeat({ type: "tool_call_start", name: "suggest_actions" }),
  ).toBe(true);
});

test("a message that ends on plain text completes the reply", () => {
  const marks = new TurnFinishMarks();
  marks.noteAssistantMessageStart();
  expect(marks.noteReplyBeat({ type: "answer_end" })).toBe(false);
  marks.noteAssistantMessageStart();
  marks.noteAssistantText("All done.");
  expect(marks.noteReplyBeat({ type: "answer_end" })).toBe(true);
});

test("visible text gathers every message of the turn, thinking never", () => {
  const marks = new TurnFinishMarks();
  marks.noteAssistantText("Looking.");
  marks.noteAssistantMessageStart();
  marks.noteAssistantText("\n\nFound it.");
  marks.noteAssistantMessageStart();
  expect(marks.visibleText).toBe("Looking.\n\nFound it.");
});
