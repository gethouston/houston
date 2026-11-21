import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WireEvent } from "@houston/runtime-client";
import { beforeEach, expect, test, vi } from "vitest";
import type { HarnessSession } from "../backends/types";

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

const conv = {
  session,
  queue: Promise.resolve() as Promise<unknown>,
  pending: 0,
};
vi.mock("./conversation-cache", () => ({
  conversations: { get: () => conv },
  getConversation: vi.fn(async () => conv),
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
const { conversationCommandInFlight } = await import(
  "./conversation-command-gate"
);
const { withWorkdirLock } = await import("./workdir-lock");
const { turnsInFlight } = await import("./turn-inflight-count");
const { config } = await import("../config");
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

async function until(ready: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !ready(); i++) await Promise.resolve();
}

beforeEach(() => {
  vi.mocked(disposeConversation).mockClear();
  vi.mocked(compactWithFactHarvest).mockClear();
  session.prompt.mockClear();
  session.compact.mockClear();
  conv.queue = Promise.resolve();
  conv.pending = 0;
  counter++;
});

test("/clear keeps the transcript, resets the session, and marks the boundary", async () => {
  const id = seeded(`plain-${counter}`);
  const { events, stop } = collect(id);

  await runConversationCommand(id, "clear", "/clear", "nonce-1");
  stop();

  expect(session.prompt).not.toHaveBeenCalled();
  expect(disposeConversation).toHaveBeenCalledWith(id, {
    deleteSessions: true,
  });
  expect(consumeSessionReplay(id)).toBe(false);

  const messages = getHistory(id)?.messages ?? [];
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

  expect(preamble?.text ?? "").not.toContain("Dr. Salgado");
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

test("a command waits for the turn already queued on the conversation", async () => {
  const id = seeded(`queued-${counter}`);
  let releaseTurn = () => {};
  conv.queue = new Promise<void>((r) => {
    releaseTurn = r;
  });
  const { events, stop } = collect(id);

  const command = runConversationCommand(id, "clear", "/clear");
  await Promise.resolve();
  expect(events).toEqual([]);
  expect(disposeConversation).not.toHaveBeenCalled();

  releaseTurn();
  await command;
  stop();
  expect(events.map((e) => e.type)).toEqual([
    "user",
    "context_cleared",
    "done",
  ]);
});

test("a command waits for the workspace lock, like every turn does", async () => {
  const id = seeded(`lock-${counter}`);
  let releaseLock = () => {};
  const held = withWorkdirLock(
    config.workspaceDir,
    () =>
      new Promise<void>((r) => {
        releaseLock = r;
      }),
  );
  const { events, stop } = collect(id);

  const command = runConversationCommand(id, "compact", "/compact");
  await Promise.resolve();
  await Promise.resolve();
  expect(events.map((e) => e.type)).toEqual(["user"]);
  expect(getHistory(id)?.messages.at(-1)?.content).toBe("/compact");
  expect(compactWithFactHarvest).not.toHaveBeenCalled();

  releaseLock();
  await held;
  await command;
  stop();
  expect(events.map((e) => e.type)).toEqual([
    "user",
    "context_compacted",
    "done",
  ]);
});

test("the conversation is held for the command's whole life", async () => {
  seeded(ASSISTANT_CONVERSATION_ID);
  let releaseHarvest = () => {};
  vi.mocked(compactWithFactHarvest).mockImplementationOnce(
    () =>
      new Promise<void>((r) => {
        releaseHarvest = r;
      }),
  );

  const command = runConversationCommand(
    ASSISTANT_CONVERSATION_ID,
    "clear",
    "/clear",
  );
  await until(() => vi.mocked(compactWithFactHarvest).mock.calls.length > 0);
  expect(conversationCommandInFlight(ASSISTANT_CONVERSATION_ID)).toBe(true);
  expect(conv.pending).toBe(1);
  expect(turnsInFlight()).toBe(1);

  releaseHarvest();
  await command;
  expect(conversationCommandInFlight(ASSISTANT_CONVERSATION_ID)).toBe(false);
  expect(conv.pending).toBe(0);
  expect(turnsInFlight()).toBe(0);
});

test("a failed command releases the conversation instead of wedging it", async () => {
  const id = seeded(`wedge-${counter}`);
  vi.mocked(compactWithFactHarvest).mockRejectedValueOnce(new Error("boom"));

  await runConversationCommand(id, "compact", "/compact");

  expect(conversationCommandInFlight(id)).toBe(false);
  expect(conv.pending).toBe(0);
  expect(turnsInFlight()).toBe(0);
  await expect(conv.queue).resolves.toBeUndefined();
});
