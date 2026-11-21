import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ConversationImportRequest } from "@houston/protocol";
import { expect, test } from "vitest";
import { renderReplayPreamble } from "../session/replay-transcript";
import {
  appendAssistantMessageAt,
  appendUserMessageAt,
  getHistoryAt,
  loadConversation,
  saveConversation,
} from "./conversation-file";
import { importConversationMessagesAt } from "./conversation-import";
import { consumeSessionReplayAt } from "./conversation-truncate";

const freshDir = () => mkdtempSync(join(tmpdir(), "houston-import-"));

const onboarding: ConversationImportRequest = {
  importId: "onboarding:first_run",
  messages: [
    { role: "assistant", content: "Hi Ana! I'm your AI Manager." },
    { role: "assistant", content: "What industry do you work in?" },
    { role: "user", content: "Industry: Retail and e-commerce" },
  ],
};

test("an import creates the conversation with its lines, in order, as real history", () => {
  const dir = freshDir();
  expect(importConversationMessagesAt(dir, "assistant", onboarding)).toBe(3);

  const history = getHistoryAt(dir, "assistant");
  expect(history?.messages.map((m) => [m.role, m.content, m.turnId])).toEqual([
    [
      "assistant",
      "Hi Ana! I'm your AI Manager.",
      "import:onboarding:first_run:0",
    ],
    [
      "assistant",
      "What industry do you work in?",
      "import:onboarding:first_run:1",
    ],
    [
      "user",
      "Industry: Retail and e-commerce",
      "import:onboarding:first_run:2",
    ],
  ]);
  expect(history?.totalMessages).toBe(3);
});

test("an import lands after what the conversation already holds", () => {
  const dir = freshDir();
  appendUserMessageAt(dir, "assistant", "Hello?", { turnId: "t1" });
  appendAssistantMessageAt(dir, "assistant", "Hi there.", { turnId: "t1" });

  importConversationMessagesAt(dir, "assistant", onboarding);

  expect(
    loadConversation(dir, "assistant")?.messages.map((m) => m.turnId),
  ).toEqual([
    "t1",
    "t1",
    "import:onboarding:first_run:0",
    "import:onboarding:first_run:1",
    "import:onboarding:first_run:2",
  ]);
});

test("an import `at: start` lands before what the chat already holds, stamped before it", () => {
  const dir = freshDir();
  appendUserMessageAt(dir, "assistant", "Yes, let's do it", { turnId: "t1" });
  appendAssistantMessageAt(dir, "assistant", "On it.", { turnId: "t1" });
  const firstTs = loadConversation(dir, "assistant")?.messages[0].ts ?? 0;

  expect(
    importConversationMessagesAt(dir, "assistant", {
      ...onboarding,
      at: "start",
    }),
  ).toBe(3);

  const messages = loadConversation(dir, "assistant")?.messages ?? [];
  expect(messages.map((m) => m.turnId)).toEqual([
    "import:onboarding:first_run:0",
    "import:onboarding:first_run:1",
    "import:onboarding:first_run:2",
    "t1",
    "t1",
  ]);
  expect(messages[0].ts).toBeLessThan(firstTs);
  expect(
    importConversationMessagesAt(dir, "assistant", {
      ...onboarding,
      at: "start",
    }),
  ).toBe(0);
});

test("the same import twice writes it once", () => {
  const dir = freshDir();
  importConversationMessagesAt(dir, "assistant", onboarding);
  expect(importConversationMessagesAt(dir, "assistant", onboarding)).toBe(0);
  expect(loadConversation(dir, "assistant")?.messages).toHaveLength(3);
  expect(
    importConversationMessagesAt(dir, "assistant", {
      importId: "onboarding:profile_completion",
      messages: [{ role: "assistant", content: "Thanks!" }],
    }),
  ).toBe(1);
});

test("the next turn carries the imported lines to the model like any earlier turn", () => {
  const dir = freshDir();
  appendUserMessageAt(dir, "assistant", "Hello?", { turnId: "t1" });
  appendAssistantMessageAt(dir, "assistant", "Hi there.", { turnId: "t1" });
  importConversationMessagesAt(dir, "assistant", onboarding);

  expect(consumeSessionReplayAt(dir, "assistant")).toBe(true);
  const replay = renderReplayPreamble(
    getHistoryAt(dir, "assistant")?.messages ?? [],
    "t2",
    100_000,
    "reset",
  );
  expect(replay?.text).toContain(
    [
      "User: Hello?",
      "Assistant: Hi there.",
      "Assistant: Hi Ana! I'm your AI Manager.",
      "Assistant: What industry do you work in?",
      "User: Industry: Retail and e-commerce",
    ].join("\n\n"),
  );
  expect(replay?.truncated).toBe(false);
});

test("an import drops a pending compaction checkpoint the replay supersedes", () => {
  const dir = freshDir();
  appendUserMessageAt(dir, "assistant", "Hello?", { turnId: "t1" });
  const conv = loadConversation(dir, "assistant");
  if (!conv) throw new Error("the seeded conversation must load");
  conv.claudeCompaction = { summary: "earlier talk", createdAt: 1 };
  saveConversation(dir, conv);

  importConversationMessagesAt(dir, "assistant", onboarding);

  const after = loadConversation(dir, "assistant");
  expect(after?.claudeCompaction).toBeUndefined();
  expect(after?.needsSessionReplay).toBe(true);
});
