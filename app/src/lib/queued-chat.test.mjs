import test from "node:test";
import assert from "node:assert/strict";
import {
  combineQueuedMessageFiles,
  combineQueuedMessageText,
  combineQueuedVisibleText,
  formatVisibleMessageText,
} from "./queued-chat.ts";

function file(name) {
  return { name };
}

test("queued text combines in submit order as one prompt", () => {
  const text = combineQueuedMessageText([
    { text: "Wait", files: [] },
    { text: "No no, about cars", files: [] },
  ]);

  assert.equal(text, "Wait\n\nNo no, about cars");
});

test("queued visible text keeps attachment names with their message", () => {
  const visible = combineQueuedVisibleText([
    { text: "Use this", files: [file("notes.pdf")] },
    { text: "Then compare", files: [file("cars.csv")] },
  ]);

  assert.equal(
    visible,
    "Use this\n\nAttached: notes.pdf\n\nThen compare\n\nAttached: cars.csv",
  );
});

test("queued files flatten without changing order", () => {
  assert.deepEqual(
    combineQueuedMessageFiles([
      { text: "first", files: [file("a.txt")] },
      { text: "second", files: [file("b.txt"), file("c.txt")] },
    ]),
    [file("a.txt"), file("b.txt"), file("c.txt")],
  );
});

test("single message visible text matches chat feed copy", () => {
  assert.equal(
    formatVisibleMessageText("Hello", [file("image.png")]),
    "Hello\n\nAttached: image.png",
  );
});
