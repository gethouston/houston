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
 * It also PERSISTS the same interaction on the assistant message under the same
 * clean-only condition, so a client that missed the live `done` recovers it
 * from history (see conversation-file.test.ts + settle-from-history).
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
  switchModeIfNeeded: vi.fn(async () => ({ rebuilt: false })),
}));

// The durable store is irrelevant to the frame contract under test.
vi.mock("../store/conversations", () => ({
  appendUserMessage: vi.fn(),
  appendAssistantMessage: vi.fn(),
  getHistory: vi.fn(() => ({ messages: [] })),
}));

const { execTurn } = await import("./exec-turn");
const { subscribe } = await import("./bus");
const { recordQuestions, recordConnection } = await import("./interaction");
const { appendAssistantMessage } = await import("../store/conversations");
const { switchModeIfNeeded } = await import("./conversation-cache");

afterAll(() => vi.restoreAllMocks());

/** The pendingInteraction persisted on `id`'s assistant message, or undefined. */
function persistedInteraction(id: string): unknown {
  const call = vi
    .mocked(appendAssistantMessage)
    .mock.calls.find((c) => c[0] === id);
  return (call?.[2] as { pendingInteraction?: unknown } | undefined)
    ?.pendingInteraction;
}

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
    mode: "execute",
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
    recordQuestions([{ kind: "question", id: "q1", question: "Which date?" }]);
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
    steps: [{ kind: "question", id: "q1", question: "Which date?" }],
  });
  // ...and it is persisted on the assistant message for a missed-`done` reload.
  expect(persistedInteraction(id)).toEqual({
    steps: [{ kind: "question", id: "q1", question: "Which date?" }],
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
  expect(persistedInteraction(id)).toBeUndefined();
});

test("a provider_error turn emits no done — the pending interaction never rides an error", async () => {
  const id = "exec-pending-provider-error";
  const { events, unsub } = collect(id);
  const conv = fakeConv((emit) => {
    // Even if a tool recorded something before the failure, it must not leak.
    recordConnection({ toolkit: "gmail" });
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
  // The recorded interaction must NOT be persisted on a failed turn either.
  expect(persistedInteraction(id)).toBeUndefined();
});

test("the turn's thinking and tool inputs are persisted on the assistant message (HOU-717)", async () => {
  const id = "exec-activity-persist";
  const conv = fakeConv((emit) => {
    emit({ type: "thinking", data: "first list, " });
    emit({ type: "thinking", data: "then decide" });
    emit({ type: "tool_start", data: { name: "bash", args: { cmd: "ls" } } });
    emit({ type: "tool_end", data: { name: "bash", isError: false } });
    emit({ type: "text", data: "done" });
  });

  await execTurn(conv, id, "turn-1", "run it", {
    author: undefined,
    priorAuthors: [],
  });

  const call = vi
    .mocked(appendAssistantMessage)
    .mock.calls.find((c) => c[0] === id);
  const meta = call?.[2] as
    | { thinking?: string; tools?: unknown[] }
    | undefined;
  expect(meta?.thinking).toBe("first list, then decide");
  expect(meta?.tools).toEqual([
    { name: "bash", input: { cmd: "ls" }, isError: false },
  ]);
});

/** The providerError persisted on `id`'s assistant message, or undefined. */
function persistedProviderError(id: string): unknown {
  const call = vi
    .mocked(appendAssistantMessage)
    .mock.calls.find((c) => c[0] === id);
  return (call?.[2] as { providerError?: unknown } | undefined)?.providerError;
}

test("a prompt-time credential throw becomes a typed provider_error frame, not raw error text (HOU-718)", async () => {
  // pi RAISES a missing credential at prompt time (the user logged out of a
  // provider that stayed active) — no stream ever exists, so the catch must
  // classify the throw. Before this, the chat showed pi's raw message
  // (node_modules doc paths included) and no reconnect card ever appeared.
  const id = "exec-throw-no-credentials";
  const { events, unsub } = collect(id);
  const conv = fakeConv(() => {
    throw new Error(
      "No API key found for openai-codex.\n\nUse /login to log into a provider via OAuth or API key. See:\n  /app/docs/providers.md\n  /app/docs/models.md",
    );
  });

  await execTurn(conv, id, "turn-1", "hey", {
    author: undefined,
    priorAuthors: [],
  });
  unsub();

  const providerError = events.find(
    (e): e is Extract<WireEvent, { type: "provider_error" }> =>
      e.type === "provider_error",
  );
  expect(providerError?.data).toMatchObject({
    kind: "unauthenticated",
    cause: "no_credentials",
    // pi threw BEFORE recording the message in its session store, so the card
    // carries the text for the reconnect retry to re-deliver — a bare
    // "continue" would meet a model that never saw the message.
    undelivered_prompt: "hey",
  });
  // The typed frame IS the terminal: no generic error, no clean done.
  expect(events.some((e) => e.type === "error")).toBe(false);
  expect(events.some((e) => e.type === "done")).toBe(false);
  // Persisted too, so the reconnect card survives a reload.
  expect(persistedProviderError(id)).toMatchObject({
    kind: "unauthenticated",
    cause: "no_credentials",
    undelivered_prompt: "hey",
  });
});

test("an unrecognized throw keeps the generic error frame and the unknown card", async () => {
  const id = "exec-throw-unknown";
  const { events, unsub } = collect(id);
  const conv = fakeConv(() => {
    throw new Error("segfault in the flux capacitor");
  });

  await execTurn(conv, id, "turn-1", "hey", {
    author: undefined,
    priorAuthors: [],
  });
  unsub();

  expect(events.some((e) => e.type === "provider_error")).toBe(false);
  const error = events.find(
    (e): e is Extract<WireEvent, { type: "error" }> => e.type === "error",
  );
  expect(error?.data.message).toContain("flux capacitor");
  expect(persistedProviderError(id)).toMatchObject({ kind: "unknown" });
});

test("pin.mode is threaded into switchModeIfNeeded for the turn", async () => {
  vi.mocked(switchModeIfNeeded).mockClear();
  const id = "exec-mode-plan";
  const conv = fakeConv((emit) => emit({ type: "text", data: "planning" }));

  await execTurn(
    conv,
    id,
    "turn-1",
    "plan it",
    { author: undefined, priorAuthors: [] },
    { mode: "plan" },
  );

  expect(switchModeIfNeeded).toHaveBeenCalledTimes(1);
  // (conv, id, model, mode) — the pin's "plan" reaches the mode arg.
  expect(vi.mocked(switchModeIfNeeded).mock.calls[0][3]).toBe("plan");
});

test("an absent pin defaults the turn to execute mode", async () => {
  vi.mocked(switchModeIfNeeded).mockClear();
  const id = "exec-mode-default";
  const conv = fakeConv((emit) => emit({ type: "text", data: "doing" }));

  await execTurn(conv, id, "turn-1", "do it", {
    author: undefined,
    priorAuthors: [],
  });

  expect(vi.mocked(switchModeIfNeeded).mock.calls[0][3]).toBe("execute");
});

test("a thrown turn emits an error frame and no done", async () => {
  const id = "exec-pending-thrown";
  const { events, unsub } = collect(id);
  const conv = fakeConv(() => {
    recordQuestions([{ kind: "question", id: "q1", question: "lost?" }]);
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
  // A thrown turn settles via the catch path, which never carries the interaction.
  expect(persistedInteraction(id)).toBeUndefined();
});
