import { expect, test } from "vitest";
import { TurnFinishMarks } from "./turn-finish";

test("the closing-message mark follows the text of the CURRENT assistant message", () => {
  const marks = new TurnFinishMarks();
  expect(marks.closingMessageSeen).toBe(false);
  marks.noteAssistantMessageStart();
  // Block separators and other whitespace-only deltas are not a message.
  marks.noteAssistantText("\n\n");
  expect(marks.closingMessageSeen).toBe(false);
  marks.noteAssistantText("Done.");
  expect(marks.closingMessageSeen).toBe(true);
  // The next model round-trip starts over: earlier text never counts.
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
