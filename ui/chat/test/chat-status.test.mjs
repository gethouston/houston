import assert from "node:assert/strict";
import test from "node:test";
import { deriveStatus } from "../src/chat-status.ts";

test("active session shows the thinking indicator after a non-streaming feed item", () => {
  assert.equal(
    deriveStatus([{ feed_type: "assistant_text", data: "done so far" }], true),
    "submitted",
  );
});

test("inactive session becomes ready after final assistant text", () => {
  assert.equal(
    deriveStatus([{ feed_type: "assistant_text", data: "done" }], false),
    "ready",
  );
});
