import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  appendAssistantMessageAt,
  appendUserMessageAt,
  getHistoryAt,
  loadConversation,
} from "./conversation-file";
import {
  consumeSessionReplayAt,
  truncateConversationAt,
} from "./conversation-truncate";

const freshDir = () => mkdtempSync(join(tmpdir(), "houston-truncate-"));

/** A two-turn transcript: t1 (user+assistant), t2 (user+assistant). */
function seedTwoTurns(dir: string) {
  appendUserMessageAt(dir, "c1", "Hi", { turnId: "t1" });
  appendAssistantMessageAt(dir, "c1", "Hi, how can I help?", { turnId: "t1" });
  appendUserMessageAt(dir, "c1", "tell me a story about a car", {
    turnId: "t2",
  });
  appendAssistantMessageAt(dir, "c1", "Once upon a time…", { turnId: "t2" });
}

test("truncate at a later turn keeps everything before it and stamps the replay marker", () => {
  const dir = freshDir();
  seedTwoTurns(dir);

  expect(truncateConversationAt(dir, "c1", "t2")).toEqual({ removed: 2 });

  const conv = loadConversation(dir, "c1");
  if (!conv) throw new Error("loadConversation returned null after truncate");
  expect(conv.messages.map((m) => [m.role, m.turnId])).toEqual([
    ["user", "t1"],
    ["assistant", "t1"],
  ]);
  expect(conv.needsSessionReplay).toBe(true);
  // The windowed read serves the truncated transcript.
  expect(getHistoryAt(dir, "c1")?.totalMessages).toBe(2);
});

test("truncate at the FIRST turn empties the transcript (editing message one)", () => {
  const dir = freshDir();
  seedTwoTurns(dir);

  expect(truncateConversationAt(dir, "c1", "t1")).toEqual({ removed: 4 });
  expect(loadConversation(dir, "c1")?.messages).toEqual([]);
});

test("truncate cuts from the turn's USER message even when the cut lands mid-transcript", () => {
  const dir = freshDir();
  seedTwoTurns(dir);
  appendUserMessageAt(dir, "c1", "third", { turnId: "t3" });

  truncateConversationAt(dir, "c1", "t2");

  const conv = loadConversation(dir, "c1");
  expect(conv?.messages.every((m) => m.turnId === "t1")).toBe(true);
});

test("unknown turn or conversation writes nothing and reports null (404 at the route)", () => {
  const dir = freshDir();
  seedTwoTurns(dir);

  expect(truncateConversationAt(dir, "c1", "ghost")).toBeNull();
  expect(truncateConversationAt(dir, "nope", "t1")).toBeNull();

  const conv = loadConversation(dir, "c1");
  expect(conv?.messages).toHaveLength(4);
  expect(conv?.needsSessionReplay).toBeUndefined();
});

test("consumeSessionReplayAt is one-shot: true once after a truncate, then false", () => {
  const dir = freshDir();
  seedTwoTurns(dir);
  truncateConversationAt(dir, "c1", "t2");

  expect(consumeSessionReplayAt(dir, "c1")).toBe(true);
  expect(consumeSessionReplayAt(dir, "c1")).toBe(false);
  // The clear is durable, not just cache-state.
  expect(loadConversation(dir, "c1")?.needsSessionReplay).toBeUndefined();
});

test("consume on an untruncated or unknown conversation is false", () => {
  const dir = freshDir();
  seedTwoTurns(dir);
  expect(consumeSessionReplayAt(dir, "c1")).toBe(false);
  expect(consumeSessionReplayAt(dir, "ghost")).toBe(false);
});
