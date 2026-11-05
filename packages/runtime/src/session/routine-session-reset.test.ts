import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WireEvent } from "@houston/runtime-client";
import { beforeEach, expect, test, vi } from "vitest";
import type {
  CreateSessionOptions,
  HarnessSession,
  ResolvedModel,
} from "../backends/types";

/**
 * The standing server's routine fire start, at its own seam: what it reads,
 * and what a conversation looks like when building the fresh session fails.
 */

process.env.HOUSTON_DATA_DIR = mkdtempSync(join(tmpdir(), "houston-rreset-"));
process.env.HOUSTON_WORKSPACE_DIR = process.env.HOUSTON_DATA_DIR;

const store = vi.hoisted(() => ({
  historyWindows: [] as unknown[],
}));
vi.mock("../store/conversations", async (importOriginal) => {
  const real = await importOriginal<typeof import("../store/conversations")>();
  return {
    ...real,
    getHistory: (...args: Parameters<typeof real.getHistory>) => {
      store.historyWindows.push(args[1]);
      return real.getHistory(...args);
    },
  };
});

const { registerBackend } = await import("../backends/registry");
const { resetRoutineSessionIfNeeded } = await import("./routine-session-reset");
const { appendAssistantMessage, appendUserMessage } = await import(
  "../store/conversations"
);
const { resetPooledRoutineSession } = await import(
  "../turn/turn-routine-context"
);
const { config } = await import("../config");
type Conversation = import("./conversation-record").Conversation;

const MODEL: ResolvedModel = {
  provider: "flaky",
  id: "flaky-1",
  contextWindow: 200_000,
};

function session(): HarnessSession & { disposed: boolean } {
  return {
    disposed: false,
    subscribe: (_l: (e: WireEvent) => void) => () => {},
    prompt: async () => {},
    abort: async () => {},
    dispose() {
      this.disposed = true;
    },
    setModel: async () => {},
    compact: async () => undefined,
    setThinkingLevel: () => {},
    getContextUsage: () => undefined,
  };
}

const built: CreateSessionOptions[] = [];
let failNext = false;
registerBackend("flaky", {
  id: "flaky",
  async createSession(options) {
    built.push(options);
    if (failNext) {
      failNext = false;
      throw new Error("backend unavailable");
    }
    return session();
  },
});

function conv(): Conversation {
  return {
    session: session(),
    queue: Promise.resolve(),
    provider: "flaky",
    model: "flaky-1",
    backendId: "flaky",
    mode: "auto",
    pending: 1,
  };
}

function seed(id: string): void {
  appendUserMessage(id, "Run it.", { turnId: `${id}-0` });
  appendAssistantMessage(id, "Done: two invoices are overdue.", {
    turnId: `${id}-0`,
  });
  appendUserMessage(id, "Run it.", { turnId: "now" });
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  built.length = 0;
  store.historyWindows.length = 0;
});

test("a fire reads one window of history; an ordinary chat and a person's turn read none", async () => {
  seed("routine-live");
  const reset = await resetRoutineSessionIfNeeded(
    conv(),
    "routine-live",
    "now",
    MODEL,
    "auto",
    "fire",
  );
  await resetRoutineSessionIfNeeded(
    conv(),
    "chat-plain",
    "now",
    MODEL,
    "auto",
    "fire",
  );
  await resetRoutineSessionIfNeeded(
    conv(),
    "routine-live",
    "now",
    MODEL,
    "auto",
    "chat",
  );
  expect(store.historyWindows).toEqual([{ limit: 200 }]);
  expect(reset?.replay?.text).toContain("Done: two invoices are overdue.");
  expect(built.map((o) => o.fresh)).toEqual([true]);
});

test("a rebuild that fails keeps the record, and its next turn retries it", async () => {
  seed("routine-flaky");
  const record = conv();
  const old = record.session;
  failNext = true;

  await expect(
    resetRoutineSessionIfNeeded(
      record,
      "routine-flaky",
      "now",
      MODEL,
      "auto",
      "fire",
    ),
  ).rejects.toThrow("backend unavailable");
  expect(record.sessionRebuildPending).toBe(true);
  expect((old as ReturnType<typeof session>).disposed).toBe(true);

  // A person's turn would keep its session, but the pending flag rebuilds it.
  appendAssistantMessage("routine-flaky", "", { turnId: "now" });
  const retry = await resetRoutineSessionIfNeeded(
    record,
    "routine-flaky",
    "later",
    MODEL,
    "auto",
    "chat",
  );
  expect(retry).not.toBeNull();
  expect(record.sessionRebuildPending).toBeUndefined();
  expect(record.session).not.toBe(old);
  expect(built.map((o) => o.fresh)).toEqual([true, true]);
});

test("a person's turn in a routine chat keeps its session on both paths; the next fire resets", async () => {
  seed("routine-chatting");
  const record = conv();
  const old = record.session;

  const standing = await resetRoutineSessionIfNeeded(
    record,
    "routine-chatting",
    "now",
    MODEL,
    "execute",
    "chat",
  );
  const pooled = resetPooledRoutineSession({
    dataDir: config.dataDir,
    conversationId: "routine-chatting",
    fire: false,
  });
  expect(standing).toBeNull();
  expect(pooled).toBe(false);
  expect(record.session).toBe(old);
  expect(built).toEqual([]);

  const fire = await resetRoutineSessionIfNeeded(
    record,
    "routine-chatting",
    "now",
    MODEL,
    "auto",
    "fire",
  );
  expect(fire).not.toBeNull();
  expect(record.session).not.toBe(old);
  expect(
    resetPooledRoutineSession({
      dataDir: config.dataDir,
      conversationId: "routine-chatting",
      fire: true,
    }),
  ).toBe(true);
});
