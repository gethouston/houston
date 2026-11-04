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
    // The model's memory, not a reply: the chat shows only the divider.
    compactionSummary: true,
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
      compactionSummary: true,
      turnId: "compact",
    }),
  ]);
});
test("a turn that fails after compacting keeps its own error beside the summary", () => {
  const { store } = setup();
  store.appendAssistantMessage("c", "", {
    compaction: { trigger: "proactive", pre_tokens: 180_000 },
    providerError: {
      kind: "rate_limited",
      provider: "anthropic",
      model: "claude-opus-5",
      retry_after_seconds: 30,
      message: "429",
    },
    turnId: "t2",
  });
  const messages = store.getHistory("c")?.messages ?? [];
  expect(messages.at(-2)).toMatchObject({
    content: "The real summary",
    compaction: { trigger: "proactive" },
  });
  expect(messages.at(-1)).toMatchObject({
    providerError: { kind: "rate_limited" },
    turnId: "t2",
  });
});
test("a later compaction never claims an older, already-passed summary", () => {
  const { store } = setup();
  // The summary was followed by a reply that carried no marker of its own.
  store.appendUserMessage("c", "Next", { turnId: "t2" });
  store.appendAssistantMessage("c", "Reply", { turnId: "t2" });
  store.appendUserMessage("c", "Again", { turnId: "t3" });
  store.appendAssistantMessage("c", "Fresh reply", {
    compaction: { trigger: "proactive", pre_tokens: 150_000 },
    turnId: "t3",
  });
  const messages = store.getHistory("c")?.messages ?? [];
  expect(messages.find((m) => m.content === "The real summary")).toMatchObject({
    compaction: { trigger: "native" },
  });
  expect(messages.find((m) => m.content === "The real summary")?.turnId).toBe(
    undefined,
  );
  expect(messages.at(-1)).toMatchObject({
    content: "Fresh reply",
    compaction: { trigger: "proactive", pre_tokens: 150_000 },
  });
});
test("clear and truncation invalidate an unconsumed checkpoint", () => {
  const { store, checkpoints } = setup();
  store.appendAssistantMessage("c", "", { contextCleared: true });
  expect(checkpoints.read("c")).toBeUndefined();
  checkpoints.save("c", "Later summary");
  store.truncateConversation("c", "t1");
  expect(checkpoints.read("c")).toBeUndefined();
});
