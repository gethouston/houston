import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WireEvent } from "@houston/runtime-client";
import { afterAll, expect, test, vi } from "vitest";
import type { HarnessSession } from "../backends/types";

/**
 * execTurn's terminal-frame contract for pending interactions: the clean `done`
 * carries whatever the model recorded via ask_user / request_connection this
 * turn, and NO error path (provider_error or a thrown turn) ever carries it.
 */

process.env.HOUSTON_DATA_DIR = mkdtempSync(
  join(tmpdir(), "houston-exec-data-"),
);
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-exec-ws-"),
);

// Pin a fixed, connected model so the turn runs without touching real auth, and
// keep every other providers export intact for the import graph.
vi.mock("../ai/providers", async (importOriginal) => {
  const real = await importOriginal<typeof import("../ai/providers")>();
  return {
    ...real,
    activeEffort: () => undefined,
    resolveModel: () => ({
      provider: "openai",
      id: "gpt-x",
      contextWindow: 1_000_000,
      reasoning: false,
    }),
  };
});

// Stub the backend seam (no rebuild) — and, crucially, avoid conversation-cache's
// module-load side effects (which build the real pi + Claude backends).
vi.mock("./conversation-cache", () => ({
  switchBackendIfNeeded: vi.fn(async () => ({
    rebuilt: false,
    preTokens: null,
  })),
}));

// The durable store is irrelevant to the frame contract under test.
vi.mock("../store/conversations", () => ({
  appendUserMessage: vi.fn(),
  appendAssistantMessage: vi.fn(),
  getHistory: vi.fn(() => ({ messages: [] })),
}));

const { execTurn } = await import("./exec-turn");
const { subscribe } = await import("./bus");
const { recordPendingInteraction } = await import("./interaction");

afterAll(() => vi.restoreAllMocks());

type Conv = Parameters<typeof execTurn>[0];

/** A minimal Conversation whose session runs `script` when prompted. */
function fakeConv(
  script: (emit: (e: WireEvent) => void) => Promise<void> | void,
): Conv {
  const listeners = new Set<(e: WireEvent) => void>();
  const session: HarnessSession = {
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    async prompt() {
      await script((e) => {
        for (const l of [...listeners]) l(e);
      });
    },
    async abort() {},
    dispose() {},
    async setModel() {},
    async compact() {},
    setThinkingLevel() {},
    getContextUsage() {
      return { tokens: 0 };
    },
  };
  return {
    session,
    queue: Promise.resolve(),
    provider: "openai",
    model: "gpt-x",
    backendId: "pi",
  } as Conv;
}

function collect(id: string) {
  const events: WireEvent[] = [];
  const unsub = subscribe(id, (e) => events.push(e));
  return { events, unsub };
}

test("the clean done frame carries the turn's recorded pending interaction", async () => {
  const id = "exec-pending-ok";
  const { events, unsub } = collect(id);
  const conv = fakeConv((emit) => {
    emit({ type: "text", data: "on it" });
    recordPendingInteraction({ kind: "question", question: "Which date?" });
  });

  await execTurn(conv, id, "turn-1", "book it", {
    author: undefined,
    priorAuthors: [],
  });
  unsub();

  const done = events.find(
    (e): e is Extract<WireEvent, { type: "done" }> => e.type === "done",
  );
  expect(done).toBeDefined();
  expect(done?.pendingInteraction).toEqual({
    kind: "question",
    question: "Which date?",
  });
});

test("the done frame omits pendingInteraction when the model asked nothing", async () => {
  const id = "exec-pending-none";
  const { events, unsub } = collect(id);
  const conv = fakeConv((emit) => emit({ type: "text", data: "all done" }));

  await execTurn(conv, id, "turn-1", "do it", {
    author: undefined,
    priorAuthors: [],
  });
  unsub();

  const done = events.find(
    (e): e is Extract<WireEvent, { type: "done" }> => e.type === "done",
  );
  expect(done).toBeDefined();
  expect(done?.pendingInteraction).toBeUndefined();
});

test("a provider_error turn emits no done — the pending interaction never rides an error", async () => {
  const id = "exec-pending-provider-error";
  const { events, unsub } = collect(id);
  const conv = fakeConv((emit) => {
    // Even if a tool recorded something before the failure, it must not leak.
    recordPendingInteraction({ kind: "connect", toolkit: "gmail" });
    emit({
      type: "provider_error",
      data: { kind: "unknown", provider: "openai", raw_excerpt: "boom" },
    });
  });

  await execTurn(conv, id, "turn-1", "try it", {
    author: undefined,
    priorAuthors: [],
  });
  unsub();

  expect(events.some((e) => e.type === "done")).toBe(false);
  expect(events.some((e) => e.type === "provider_error")).toBe(true);
});

test("a thrown turn emits an error frame and no done", async () => {
  const id = "exec-pending-thrown";
  const { events, unsub } = collect(id);
  const conv = fakeConv(() => {
    recordPendingInteraction({ kind: "question", question: "lost?" });
    throw new Error("kaboom");
  });

  await execTurn(conv, id, "turn-1", "run", {
    author: undefined,
    priorAuthors: [],
  });
  unsub();

  expect(events.some((e) => e.type === "done")).toBe(false);
  const err = events.find(
    (e): e is Extract<WireEvent, { type: "error" }> => e.type === "error",
  );
  expect(err?.data.message).toContain("kaboom");
});
