import test from "node:test";
import assert from "node:assert/strict";
import { feedItemsToMessages } from "../src/feed-to-messages.ts";

test("attaches file changes to the previous assistant message after final result", () => {
  const messages = feedItemsToMessages([
    { feed_type: "user_message", data: "make a deck" },
    { feed_type: "assistant_text", data: "Done." },
    {
      feed_type: "final_result",
      data: { result: "Done.", cost_usd: null, duration_ms: 10 },
    },
    {
      feed_type: "file_changes",
      data: {
        created: ["/tmp/deck.pptx"],
        modified: ["/tmp/notes.txt"],
      },
    },
  ]);

  assert.equal(messages.length, 2);
  assert.deepEqual(messages[1].fileChanges, [
    { path: "/tmp/deck.pptx", status: "created" },
    { path: "/tmp/notes.txt", status: "modified" },
  ]);
});

test("context_compacted becomes a system divider carrying compaction info", () => {
  const messages = feedItemsToMessages([
    { feed_type: "user_message", data: "keep going" },
    { feed_type: "assistant_text", data: "Sure." },
    {
      feed_type: "context_compacted",
      data: { trigger: "proactive", pre_tokens: 185000 },
    },
    { feed_type: "assistant_text", data: "Continuing from the summary." },
  ]);

  const divider = messages.find((m) => m.compaction);
  assert.ok(divider, "a divider message is produced");
  assert.equal(divider.from, "system");
  assert.equal(divider.content, "");
  assert.equal(divider.compaction.trigger, "proactive");
  assert.equal(divider.compaction.preTokens, 185000);
  // The surrounding turns are preserved (full history stays visible).
  assert.ok(messages.some((m) => m.from === "user" && m.content === "keep going"));
  assert.ok(
    messages.some(
      (m) => m.from === "assistant" && m.content === "Continuing from the summary.",
    ),
  );
});

test("context_compacted tolerates a null pre_tokens", () => {
  const messages = feedItemsToMessages([
    { feed_type: "context_compacted", data: { trigger: "native", pre_tokens: null } },
  ]);
  const divider = messages.find((m) => m.compaction);
  assert.ok(divider);
  assert.equal(divider.compaction.trigger, "native");
  assert.equal(divider.compaction.preTokens, undefined);
});
