import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WireEvent } from "@houston/runtime-client";
import { beforeEach, expect, test, vi } from "vitest";
import type { HarnessSession } from "../backends/types";

/**
 * The conversation commands end-to-end against the REAL transcript store: what
 * a `/clear` must leave behind is precisely a transcript that still has
 * everything (the user's record, `houston_recall`'s search space) and a model
 * that can no longer see any of it. Faking the store would test neither half.
 */

process.env.HOUSTON_DATA_DIR = mkdtempSync(join(tmpdir(), "houston-cmd-data-"));
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-cmd-ws-"),
);

const session = {
  subscribe: () => () => {},
  prompt: vi.fn(async () => {}),
  abort: async () => {},
  dispose: () => {},
  setModel: async () => {},
  compact: vi.fn(async () => ({ summary: "" })),
  setThinkingLevel: () => {},
  getContextUsage: () => ({ tokens: 90_000 }),
} satisfies HarnessSession;

vi.mock("./conversation-cache", () => ({
  conversations: { get: () => undefined },
  getConversation: vi.fn(async () => ({ session, queue: Promise.resolve() })),
}));
vi.mock("./chat", () => ({ disposeConversation: vi.fn(async () => {}) }));
vi.mock("./durable-facts-harvest", () => ({
  compactWithFactHarvest: vi.fn(async () => {}),
}));

const { runConversationCommand } = await import("./conversation-command-run");
const { subscribe } = await import("./bus");
const { disposeConversation } = await import("./chat");
const { compactWithFactHarvest } = await import("./durable-facts-harvest");
const { renderReplayPreamble } = await import("./replay-transcript");
const {
  appendAssistantMessage,
  appendUserMessage,
  consumeSessionReplay,
  getHistory,
} = await import("../store/conversations");
const { ASSISTANT_CONVERSATION_ID } = await import(
  "@houston/host/src/routes/assistant"
);

let counter = 0;
/** A conversation with one prior exchange already on disk. */
function seeded(id: string): string {
  appendUserMessage(id, "my dentist is Dr. Salgado", { turnId: "t0" });
  appendAssistantMessage(id, "noted", { turnId: "t0" });
  return id;
}

function collect(id: string): { events: WireEvent[]; stop: () => void } {
  const events: WireEvent[] = [];
  const stop = subscribe(id, (f) => events.push(f));
  return { events, stop };
}

beforeEach(() => {
  vi.mocked(disposeConversation).mockClear();
  vi.mocked(compactWithFactHarvest).mockClear();
  session.prompt.mockClear();
  session.compact.mockClear();
  counter++;
});

test("/clear keeps the transcript, resets the session, and marks the boundary", async () => {
  const id = seeded(`plain-${counter}`);
  const { events, stop } = collect(id);

  await runConversationCommand(id, "clear", "/clear", "nonce-1");
  stop();

  // The model never sees a command as a prompt.
  expect(session.prompt).not.toHaveBeenCalled();
  // The backend-native session AND its on-disk history are gone: that is what
  // makes the next turn start with an empty context.
  expect(disposeConversation).toHaveBeenCalledWith(id, {
    deleteSessions: true,
  });
  // ...and NO replay is stamped, so nothing carries the old turns back in.
  expect(consumeSessionReplay(id)).toBe(false);

  const messages = getHistory(id)?.messages ?? [];
  // The transcript is intact (the audit trail + what houston_recall searches).
  expect(messages[0]?.content).toBe("my dentist is Dr. Salgado");
  expect(messages.at(-2)?.content).toBe("/clear");
  expect(messages.at(-1)?.contextCleared).toBe(true);

  expect(events.map((e) => e.type)).toEqual([
    "user",
    "context_cleared",
    "done",
  ]);
  expect(events[0]).toMatchObject({ data: { content: "/clear" } });
});

test("a rebuilt session after /clear carries nothing from before the marker", async () => {
  const id = seeded(`window-${counter}`);
  await runConversationCommand(id, "clear", "/clear");
  appendUserMessage(id, "what is my dentist called?", { turnId: "t9" });

  const messages = getHistory(id)?.messages ?? [];
  const preamble = renderReplayPreamble(messages, "t9", 100_000, "reset");

  // A cross-backend rebuild renders the canonical transcript into the prompt.
  // Everything the user cleared must be absent from it, or the model would
  // remember exactly what it was told to forget.
  expect(preamble?.text ?? "").not.toContain("Dr. Salgado");
  // And the transcript itself still has it, for the user and for recall.
  expect(messages.some((m) => m.content.includes("Dr. Salgado"))).toBe(true);
});

test("/clear harvests the assistant's durable facts before wiping the session", async () => {
  const id = ASSISTANT_CONVERSATION_ID;
  seeded(id);

  await runConversationCommand(id, "clear", "/clear");

  expect(compactWithFactHarvest).toHaveBeenCalledWith(
    session,
    ASSISTANT_CONVERSATION_ID,
  );
  // Order matters: facts are extracted while the turns are still in context.
  expect(
    vi.mocked(compactWithFactHarvest).mock.invocationCallOrder[0],
  ).toBeLessThan(vi.mocked(disposeConversation).mock.invocationCallOrder[0]);
});

test("/clear on an ordinary conversation runs no summarizer at all", async () => {
  const id = seeded(`nofacts-${counter}`);

  await runConversationCommand(id, "clear", "/clear");

  expect(compactWithFactHarvest).not.toHaveBeenCalled();
  expect(disposeConversation).toHaveBeenCalled();
});

test("a failed fact harvest never costs the user the clear", async () => {
  vi.mocked(compactWithFactHarvest).mockRejectedValueOnce(new Error("no key"));
  const id = ASSISTANT_CONVERSATION_ID;

  await runConversationCommand(id, "clear", "/clear");

  expect(disposeConversation).toHaveBeenCalled();
  expect(getHistory(id)?.messages.at(-1)?.contextCleared).toBe(true);
});

test("a session too small to harvest is noted, never warned about", async () => {
  // pi refuses to summarize a short session. That is the NORMAL state of a
  // fresh chat, not a failure: warning about it trains us to ignore warnings.
  vi.mocked(compactWithFactHarvest).mockRejectedValueOnce(
    new Error("Nothing to compact (session too small)"),
  );
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  await runConversationCommand(ASSISTANT_CONVERSATION_ID, "clear", "/clear");

  expect(warn).not.toHaveBeenCalled();
  expect(info).toHaveBeenCalledWith(
    expect.stringContaining("nothing to harvest"),
    expect.stringContaining("session too small"),
  );
  info.mockRestore();
  warn.mockRestore();
});

test("a harvest that really failed still warns", async () => {
  vi.mocked(compactWithFactHarvest).mockRejectedValueOnce(new Error("no key"));
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  await runConversationCommand(ASSISTANT_CONVERSATION_ID, "clear", "/clear");

  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining("fact harvest before /clear failed"),
    "no key",
  );
  warn.mockRestore();
});

test("/compact compacts through the fact harvest and marks it manual", async () => {
  const id = seeded(`compact-${counter}`);
  const { events, stop } = collect(id);

  await runConversationCommand(id, "compact", "/compact");
  stop();

  expect(session.prompt).not.toHaveBeenCalled();
  expect(compactWithFactHarvest).toHaveBeenCalledWith(session, id);
  // The session is NOT torn down: compaction keeps the summarized context.
  expect(disposeConversation).not.toHaveBeenCalled();

  expect(events.map((e) => e.type)).toEqual([
    "user",
    "context_compacted",
    "done",
  ]);
  expect(events[1]).toMatchObject({
    data: { trigger: "manual", pre_tokens: 90_000 },
  });
  expect(getHistory(id)?.messages.at(-1)?.compaction).toMatchObject({
    trigger: "manual",
  });
});

test("a compaction that fails settles the turn instead of hanging the chat", async () => {
  vi.mocked(compactWithFactHarvest).mockRejectedValueOnce(
    new Error("provider unreachable"),
  );
  const id = seeded(`fail-${counter}`);
  const { events, stop } = collect(id);

  await runConversationCommand(id, "compact", "/compact");
  stop();

  expect(events.map((e) => e.type)).toEqual(["user", "error"]);
  expect(events[1]).toMatchObject({
    data: { message: "provider unreachable" },
  });
});
