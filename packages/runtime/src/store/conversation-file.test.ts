import { test, expect } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendUserMessageAt,
  appendAssistantMessageAt,
  deleteConversationAt,
  getHistoryAt,
  listConversationsAt,
  loadConversation,
  renameConversationAt,
} from "./conversation-file";

const freshDir = () => mkdtempSync(join(tmpdir(), "houston-conv-"));

test("rename persists the new title and bumps updatedAt", () => {
  const dir = freshDir();
  appendUserMessageAt(dir, "c1", "hello there, long opening message");
  const before = loadConversation(dir, "c1")!;

  expect(renameConversationAt(dir, "c1", "Quarterly report")).toBe(true);

  const after = loadConversation(dir, "c1")!;
  expect(after.title).toBe("Quarterly report");
  expect(after.updatedAt).toBeGreaterThanOrEqual(before.updatedAt);
  expect(after.messages).toHaveLength(1); // transcript untouched
  expect(listConversationsAt(dir)[0]!.title).toBe("Quarterly report");
});

test("rename of an unknown conversation reports failure, writes nothing", () => {
  const dir = freshDir();
  expect(renameConversationAt(dir, "ghost", "nope")).toBe(false);
  expect(listConversationsAt(dir)).toHaveLength(0);
});

test("delete removes the transcript file; list and history no longer see it", () => {
  const dir = freshDir();
  appendUserMessageAt(dir, "c1", "hi");
  appendAssistantMessageAt(dir, "c1", "hello!");
  appendUserMessageAt(dir, "c2", "other");

  expect(deleteConversationAt(dir, "c1")).toBe(true);

  expect(existsSync(join(dir, "c1.json"))).toBe(false);
  expect(getHistoryAt(dir, "c1")).toBeNull();
  expect(listConversationsAt(dir).map((c) => c.id)).toEqual(["c2"]);
});

test("delete of an unknown conversation reports failure (404 at the route)", () => {
  const dir = freshDir();
  expect(deleteConversationAt(dir, "ghost")).toBe(false);
});

test("delete then re-append starts a fresh conversation, not a resurrected one", () => {
  const dir = freshDir();
  appendUserMessageAt(dir, "c1", "first life");
  deleteConversationAt(dir, "c1");
  appendUserMessageAt(dir, "c1", "second life");

  const conv = loadConversation(dir, "c1")!;
  expect(conv.messages).toHaveLength(1);
  expect(conv.messages[0]!.content).toBe("second life");
});
