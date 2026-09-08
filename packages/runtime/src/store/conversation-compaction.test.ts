import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { createCompactionCheckpoints } from "./conversation-compaction";
import { createConversationStore } from "./conversations";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "compaction-store-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const setup = () => {
  const store = createConversationStore(dir);
  store.appendUserMessage("c", "First turn", { turnId: "t1" });
  store.appendAssistantMessage("c", "Before compaction");
  const checkpoints = createCompactionCheckpoints(dir);
  const checkpoint = checkpoints.save("c", "The real summary");
  return { store, checkpoints, checkpoint };
};
test("checkpoint and summary marker are durable in the conversation file", () => {
  const { checkpoint } = setup();
  const stored = JSON.parse(readFileSync(join(dir, "c.json"), "utf8"));
  expect(stored.claudeCompaction).toEqual(checkpoint);
  expect(stored.messages.at(-1)).toMatchObject({
    content: "The real summary",
    compaction: { trigger: "native" },
  });
  expect(createCompactionCheckpoints(dir).read("c")).toEqual(checkpoint);
});
test("the command's marker updates the summary marker without an empty duplicate", () => {
  const { store } = setup();
  store.appendAssistantMessage("c", "", {
    compaction: { trigger: "manual", pre_tokens: 100 },
    turnId: "compact",
  });
  const messages = store.getHistory("c")?.messages ?? [];
  expect(messages.filter((m) => m.compaction)).toEqual([
    expect.objectContaining({
      content: "The real summary",
      compaction: { trigger: "manual", pre_tokens: 100 },
      turnId: "compact",
    }),
  ]);
});
test("clear and truncation invalidate an unconsumed checkpoint", () => {
  const { store, checkpoints } = setup();
  store.appendAssistantMessage("c", "", { contextCleared: true });
  expect(checkpoints.read("c")).toBeUndefined();
  checkpoints.save("c", "Later summary");
  store.truncateConversation("c", "t1");
  expect(checkpoints.read("c")).toBeUndefined();
});
