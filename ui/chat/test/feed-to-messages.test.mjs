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

test("pairs tool_call with tool_result by tool_use_id and propagates the id onto ToolEntry", () => {
  const messages = feedItemsToMessages([
    { feed_type: "user_message", data: "do two things" },
    {
      feed_type: "tool_call",
      data: { name: "Bash", input: null, tool_use_id: "tu_a" },
    },
    {
      feed_type: "tool_call",
      data: {
        name: "Bash",
        input: { command: "ls" },
        tool_use_id: "tu_a",
      },
    },
    {
      feed_type: "tool_call",
      data: { name: "Read", input: null, tool_use_id: "tu_b" },
    },
    {
      feed_type: "tool_call",
      data: {
        name: "Read",
        input: { path: "/etc/hosts" },
        tool_use_id: "tu_b",
      },
    },
    // tool_results arrive OUT OF ORDER on purpose — sequential pairing
    // would attach them to the wrong calls.
    {
      feed_type: "tool_result",
      data: { content: "127.0.0.1 localhost", is_error: false, tool_use_id: "tu_b" },
    },
    {
      feed_type: "tool_result",
      data: { content: "src/\npackage.json\n", is_error: false, tool_use_id: "tu_a" },
    },
    {
      feed_type: "assistant_text",
      data: "done both",
    },
  ]);

  // user + assistant (which holds both tool entries)
  assert.equal(messages.length, 2);
  const assistant = messages[1];
  assert.equal(assistant.tools.length, 2);

  const [bashEntry, readEntry] = assistant.tools;
  assert.equal(bashEntry.name, "Bash");
  assert.equal(bashEntry.tool_use_id, "tu_a");
  assert.deepEqual(bashEntry.input, { command: "ls" });
  assert.equal(bashEntry.result.content, "src/\npackage.json\n");

  assert.equal(readEntry.name, "Read");
  assert.equal(readEntry.tool_use_id, "tu_b");
  assert.deepEqual(readEntry.input, { path: "/etc/hosts" });
  assert.equal(readEntry.result.content, "127.0.0.1 localhost");
});

test("falls back to sequential tool pairing when tool_use_id is absent on legacy rows", () => {
  // Pre-tool_use_id chat_feed rows lacked the field. New `feed-to-messages`
  // logic must still pair them in insertion order so existing chat history
  // renders correctly.
  const messages = feedItemsToMessages([
    { feed_type: "user_message", data: "legacy turn" },
    { feed_type: "tool_call", data: { name: "Bash", input: null } },
    {
      feed_type: "tool_call",
      data: { name: "Bash", input: { command: "echo hi" } },
    },
    {
      feed_type: "tool_result",
      data: { content: "hi", is_error: false },
    },
  ]);

  assert.equal(messages.length, 2);
  const tool = messages[1].tools[0];
  assert.equal(tool.name, "Bash");
  assert.equal(tool.tool_use_id, undefined);
  assert.equal(tool.result.content, "hi");
});
