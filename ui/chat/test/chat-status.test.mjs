import assert from "node:assert/strict";
import test from "node:test";
import { deriveStatus } from "../src/chat-status.ts";

test("active session shows the thinking indicator after a non-streaming feed item", () => {
  // Mid-turn (isLoading) with a settled, non-streaming last item: the indicator
  // is the only progress signal during silent stretches (e.g. Gemini batching
  // its whole response after a quiet gap), so deriveStatus yields "submitted",
  // not "streaming". See chat-status.ts. This assertion was left on the old
  // contract when deriveStatus changed in f5ecd33.
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
