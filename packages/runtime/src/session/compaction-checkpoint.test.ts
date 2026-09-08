import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";

// Keep every file these tests touch inside a throwaway dir (same discipline as
// chat.test.ts): the compaction store binds to config.dataDir at module load.
process.env.HOUSTON_DATA_DIR = mkdtempSync(
  join(tmpdir(), "houston-checkpoint-"),
);
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-checkpoint-ws-"),
);

/**
 * THE CLAUDE BACKEND'S COMPACTION CHECKPOINT is a summary armed to be prepended
 * to the conversation's NEXT anthropic prompt, and while it is armed the
 * backend deliberately does not resume a session either (backends/claude/
 * session.ts). So it is session state, and every reset that drops session state
 * has to drop it too: a `/clear` that left it armed would answer the user's
 * fresh start from a summary of what they just cleared, and a conversation that
 * left anthropic would read the same stretch twice on its way back - once as
 * the transcript replay the switch carried over, once as this summary.
 */

const backends = vi.hoisted(() => ({
  next: { id: "pi", createSession: vi.fn(async () => ({}) as never) },
}));
vi.mock("./conversation-backends", () => ({
  serverBackendFor: () => backends.next,
}));

const { conversationCompactions } = await import(
  "../store/conversation-compaction"
);
const { saveConversation } = await import("../store/conversation-file");
const { disposeConversation } = await import("./conversation-control");
const { switchBackendIfNeeded } = await import("./conversation-switch");

const conversationsDir = join(
  process.env.HOUSTON_DATA_DIR as string,
  "conversations",
);

function armed(id: string): string {
  saveConversation(conversationsDir, {
    id,
    title: "t",
    createdAt: 1,
    updatedAt: 1,
    messages: [],
  });
  conversationCompactions.save(id, "the summary");
  expect(conversationCompactions.read(id)?.summary).toBe("the summary");
  return id;
}

test("a conversation leaving the Claude backend leaves no armed summary", async () => {
  const id = armed("switch-away");
  await switchBackendIfNeeded(
    {
      backendId: "anthropic",
      session: {
        getContextUsage: () => ({ tokens: 10 }),
        dispose: () => {},
      },
      mode: "execute",
    } as never,
    id,
    { provider: "openai", id: "gpt-5.5" } as never,
    "execute",
  );
  expect(conversationCompactions.read(id)).toBeUndefined();
});

test("a same-backend turn keeps the summary it is about to deliver", async () => {
  const id = armed("switch-stay");
  backends.next = {
    id: "anthropic",
    createSession: vi.fn(async () => ({}) as never),
  };
  await switchBackendIfNeeded(
    { backendId: "anthropic", session: {}, mode: "execute" } as never,
    id,
    { provider: "anthropic", id: "claude-opus-4-8" } as never,
    "execute",
  );
  expect(conversationCompactions.read(id)?.summary).toBe("the summary");
  backends.next = { id: "pi", createSession: vi.fn(async () => ({}) as never) };
});

test("dropping a conversation's sessions disarms the checkpoint", async () => {
  // What `/clear` and the edit-and-resend rewind both run. Left armed, the next
  // anthropic turn answers from a summary of the history just deleted.
  const id = armed("cleared");
  await disposeConversation(id, { deleteSessions: true });
  expect(conversationCompactions.read(id)).toBeUndefined();
});

test("a dispose that keeps history keeps the checkpoint", async () => {
  const id = armed("evicted");
  await disposeConversation(id);
  expect(conversationCompactions.read(id)?.summary).toBe("the summary");
});
