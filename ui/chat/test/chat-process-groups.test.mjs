import assert from "node:assert/strict";
import test from "node:test";
import { getChatDisplayItems } from "../src/chat-process-groups.ts";

const assistant = (key, content, extras = {}) => ({
  key,
  from: "assistant",
  content,
  isStreaming: false,
  tools: extras.tools ?? [],
  fileChanges: extras.fileChanges ?? [],
  reasoning: extras.reasoning,
});

test("groups thinking and tools into one process block before assistant text", () => {
  const items = getChatDisplayItems(
    [
      assistant("a1", "First message"),
      assistant("a2", "", {
        reasoning: { content: "Thinking", isStreaming: false },
      }),
      assistant("a3", "Second message", {
        tools: [
          {
            name: "Read",
            input: { file_path: "notes.md" },
            result: { content: "ok", is_error: false },
          },
        ],
      }),
    ],
    "ready",
  );

  assert.deepEqual(
    items.map((item) => item.kind),
    ["message", "process", "message"],
  );
  assert.equal(items[1].isActive, false);
  assert.equal(items[1].segments.length, 2);
  assert.equal(items[2].message.content, "Second message");
  assert.equal(items[2].message.tools.length, 0);
});

test("keeps trailing process block active while session streams", () => {
  const items = getChatDisplayItems(
    [
      assistant("a1", "First message"),
      assistant("a2", "", {
        tools: [{ name: "Bash", input: { command: "pwd" } }],
      }),
    ],
    "streaming",
  );

  assert.deepEqual(
    items.map((item) => item.kind),
    ["message", "process"],
  );
  assert.equal(items[1].isActive, true);
});

test("collapses trailing process block once session is ready", () => {
  const items = getChatDisplayItems(
    [
      assistant("a1", "First message"),
      assistant("a2", "", {
        tools: [
          {
            name: "Bash",
            input: { command: "pwd" },
            result: { content: "/tmp", is_error: false },
          },
        ],
      }),
    ],
    "ready",
  );

  assert.equal(items[1].kind, "process");
  assert.equal(items[1].isActive, false);
});
