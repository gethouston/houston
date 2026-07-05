import assert from "node:assert/strict";
import test from "node:test";
import { formatVisibleMessageText } from "./queued-chat.ts";

function file(name) {
  return { name };
}

test("visible text without files is the text verbatim", () => {
  assert.equal(formatVisibleMessageText("Hello", []), "Hello");
});

test("visible text appends attachment names", () => {
  assert.equal(
    formatVisibleMessageText("Use this", [file("notes.pdf"), file("a.csv")]),
    "Use this\n\nAttached: notes.pdf, a.csv",
  );
});

test("attachment-only sends show just the attachment line", () => {
  assert.equal(
    formatVisibleMessageText("", [file("notes.pdf")]),
    "Attached: notes.pdf",
  );
});
