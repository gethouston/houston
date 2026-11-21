import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WireEvent } from "@houston/runtime-client";
import { afterAll, afterEach, expect, test, vi } from "vitest";
import type { HarnessSession } from "../backends/types";

process.env.HOUSTON_DATA_DIR = mkdtempSync(
  join(tmpdir(), "houston-exec-data-"),
);
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-exec-ws-"),
);

const DEFAULT_MODEL = {
  provider: "openai",
  id: "gpt-x",
  contextWindow: 1_000_000,
  reasoning: false,
};
const resolution = vi.hoisted(() => ({
  run: (): {
    provider: string;
    id: string;
    contextWindow: number;
    reasoning: boolean;
  } => ({
    provider: "openai",
    id: "gpt-x",
    contextWindow: 1_000_000,
    reasoning: false,
  }),
}));
vi.mock("../ai/providers", async (importOriginal) => {
  const real = await importOriginal<typeof import("../ai/providers")>();
  return {
    ...real,
    activeEffort: () => undefined,
    resolveModel: () => resolution.run(),
  };
});

vi.mock("../auth/credential-health", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("../auth/credential-health")>();
  return {
    ...real,
    noteAuthFailure: vi.fn(),
    noteQuotaExhausted: vi.fn(),
    clearProviderMarks: vi.fn(),
  };
});
vi.mock("../auth/report-revoked", () => ({
  reportRevokedServedToken: vi.fn(),
}));

vi.mock("./conversation-cache", () => ({
  switchBackendIfNeeded: vi.fn(async () => ({
    rebuilt: false,
    preTokens: null,
  })),
  switchModeIfNeeded: vi.fn(async () => ({ rebuilt: false })),
  conversations: { peek: () => undefined, delete: () => false },
}));

vi.mock("../store/conversations", () => ({
  appendUserMessage: vi.fn(),
  appendAssistantMessage: vi.fn(),
  getHistory: vi.fn(() => ({ messages: [] })),
  consumeSessionReplay: vi.fn(() => false),
}));

const { execTurn, recordUserTurn } = await import("./exec-turn");
const { subscribe } = await import("./bus");
const { recordQuestions, recordConnection, recordConfirmation } = await import(
  "./interaction"
);
const { appendAssistantMessage, appendUserMessage, consumeSessionReplay } =
  await import("../store/conversations");
const { getHistory } = await import("../store/conversations");
const { switchModeIfNeeded } = await import("./conversation-cache");
const { noteAuthFailure } = await import("../auth/credential-health");
const { reportRevokedServedToken } = await import("../auth/report-revoked");

afterEach(() => {
  resolution.run = () => ({ ...DEFAULT_MODEL });
  vi.mocked(noteAuthFailure).mockClear();
  vi.mocked(reportRevokedServedToken).mockClear();
});
afterAll(() => vi.restoreAllMocks());

function persistedInteraction(id: string): unknown {
  const call = vi
    .mocked(appendAssistantMessage)
    .mock.calls.find((c) => c[0] === id);
  return (call?.[2] as { pendingInteraction?: unknown } | undefined)
    ?.pendingInteraction;
}

type Conv = Parameters<typeof execTurn>[0];

function fakeConv(
  script: (emit: (e: WireEvent) => void) => Promise<void> | void,
  opts: {
    provider?: string;
    setModel?: () => never;
    onPrompt?: (text: string) => void;
  } = {},
): Conv {
  const listeners = new Set<(e: WireEvent) => void>();
  const session: HarnessSession = {
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    async prompt(text) {
      opts.onPrompt?.(text);
      await script((e) => {
        for (const l of [...listeners]) l(e);
      });
    },
    async abort() {},
    dispose() {},
    async setModel() {
      opts.setModel?.();
    },
    async compact(): Promise<undefined> {},
    setThinkingLevel() {},
    getContextUsage() {
      return { tokens: 0 };
    },
  };
  return {
    session,
    queue: Promise.resolve(),
    provider: opts.provider ?? "openai",
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

test("a clean plan turn with assistant output falls back to an empty plan_ready", async () => {
  const id = "exec-plan-fallback";
  const { events, unsub } = collect(id);
  const conv = fakeConv((emit) =>
    emit({ type: "text", data: "Here is the plan." }),
  );

  await execTurn(
    conv,
    id,
    "turn-1",
    "plan it",
    { author: undefined, priorAuthors: [] },
    { mode: "plan" },
  );
  unsub();

  const fallback = { steps: [{ kind: "plan_ready", id: "p1", summary: "" }] };
  const done = events.find(
    (e): e is Extract<WireEvent, { type: "done" }> => e.type === "done",
  );
  expect(done?.pendingInteraction).toEqual(fallback);
  expect(persistedInteraction(id)).toEqual(fallback);
});

test("a plan turn with a recorded question keeps that interaction instead of falling back", async () => {
  const id = "exec-plan-question";
  const { events, unsub } = collect(id);
  const conv = fakeConv((emit) => {
    emit({ type: "text", data: "I need one detail." });
    recordQuestions([{ kind: "question", id: "q1", question: "Which date?" }]);
  });

  await execTurn(
    conv,
    id,
    "turn-1",
    "plan it",
    { author: undefined, priorAuthors: [] },
    { mode: "plan" },
  );
  unsub();

  const done = events.find(
    (e): e is Extract<WireEvent, { type: "done" }> => e.type === "done",
  );
  expect(done?.pendingInteraction).toEqual({
    steps: [{ kind: "question", id: "q1", question: "Which date?" }],
  });
});

test("a tool-only plan turn (no assistant text) never receives the plan fallback", async () => {
  const id = "exec-plan-tool-only-no-fallback";
  const { events, unsub } = collect(id);
  const conv = fakeConv(() => {});

  await execTurn(
    conv,
    id,
    "turn-1",
    "plan it",
    { author: undefined, priorAuthors: [] },
    { mode: "plan" },
  );
  unsub();

  const done = events.find(
    (e): e is Extract<WireEvent, { type: "done" }> => e.type === "done",
  );
  expect(done?.pendingInteraction).toBeUndefined();
  expect(persistedInteraction(id)).toBeUndefined();
});

test("a mid-turn execute-to-plan flip still receives the plan fallback", async () => {
  const id = "exec-flip-plan-fallback";
  const { events, unsub } = collect(id);
  const conv = fakeConv((emit) => {
    emit({ type: "text", data: "Here is the plan you asked for." });
    if (conv.liveMode) conv.liveMode.current = "plan";
  });

  await execTurn(conv, id, "turn-1", "plan it from now on", {
    author: undefined,
    priorAuthors: [],
  });
  unsub();

  const fallback = { steps: [{ kind: "plan_ready", id: "p1", summary: "" }] };
  const done = events.find(
    (e): e is Extract<WireEvent, { type: "done" }> => e.type === "done",
  );
  expect(done?.pendingInteraction).toEqual(fallback);
  expect(persistedInteraction(id)).toEqual(fallback);
});

test("an execute turn never receives the plan fallback", async () => {
  const id = "exec-execute-no-plan-fallback";
  const { events, unsub } = collect(id);
  const conv = fakeConv((emit) => emit({ type: "text", data: "All done." }));

  await execTurn(conv, id, "turn-1", "do it", {
    author: undefined,
    priorAuthors: [],
  });
  unsub();

  const done = events.find(
    (e): e is Extract<WireEvent, { type: "done" }> => e.type === "done",
  );
  expect(done?.pendingInteraction).toBeUndefined();
  expect(persistedInteraction(id)).toBeUndefined();
});

test("a provider_error turn emits no done — the pending interaction never rides an error", async () => {
  const id = "exec-pending-provider-error";
  const { events, unsub } = collect(id);
  const conv = fakeConv((emit) => {
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
  expect(persistedInteraction(id)).toBeUndefined();
});

test("a provider-error plan turn never receives the plan fallback", async () => {
  const id = "exec-plan-error-no-fallback";
  const { events, unsub } = collect(id);
  const conv = fakeConv((emit) => {
    emit({ type: "text", data: "Partial plan." });
    emit({
      type: "provider_error",
      data: { kind: "unknown", provider: "openai", raw_excerpt: "boom" },
    });
  });

  await execTurn(
    conv,
    id,
    "turn-1",
    "plan it",
    { author: undefined, priorAuthors: [] },
    { mode: "plan" },
  );
  unsub();

  expect(events.some((e) => e.type === "done")).toBe(false);
  expect(persistedInteraction(id)).toBeUndefined();
});

test("the turn's thinking and tool inputs are persisted on the assistant message (HOU-717)", async () => {
  const id = "exec-activity-persist";
  const conv = fakeConv((emit) => {
    emit({ type: "thinking", data: "first list, " });
    emit({ type: "thinking", data: "then decide" });
    emit({ type: "tool_start", data: { name: "bash", args: { cmd: "ls" } } });
    emit({
      type: "tool_end",
      data: { name: "bash", isError: false, content: "file-a\nfile-b" },
    });
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
    {
      name: "bash",
      input: { cmd: "ls" },
      result: "file-a\nfile-b",
      isError: false,
    },
  ]);
});

test("a started mission receipt reaches the persisted assistant tool record", async () => {
  const id = "exec-mission-receipt";
  const mission = { id: "m1", title: "Research", agent: "Ada" };
  const conv = fakeConv((emit) => {
    emit({
      type: "tool_start",
      data: { name: "start_mission", args: { agent: "Ada" } },
    });
    emit({
      type: "tool_end",
      data: { name: "start_mission", isError: false, mission },
    });
    emit({ type: "text", data: "Ada is on it" });
  });
  await execTurn(conv, id, "turn-1", "start it", {
    author: undefined,
    priorAuthors: [],
  });
  const call = vi
    .mocked(appendAssistantMessage)
    .mock.calls.find((entry) => entry[0] === id);
  expect(call?.[2]).toMatchObject({
    tools: [{ name: "start_mission", mission }],
  });
});

function persistedProviderError(id: string): unknown {
  const call = vi
    .mocked(appendAssistantMessage)
    .mock.calls.find((c) => c[0] === id);
  return (call?.[2] as { providerError?: unknown } | undefined)?.providerError;
}

test("a prompt-time credential throw becomes a typed provider_error frame, not raw error text (HOU-718)", async () => {
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
    undelivered_prompt: "hey",
  });
  expect(events.some((e) => e.type === "error")).toBe(false);
  expect(events.some((e) => e.type === "done")).toBe(false);
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

test("a throw before the provider write is attributed to the RESOLVED provider, never the cached one", async () => {
  resolution.run = () => ({ ...DEFAULT_MODEL, provider: "openai-codex" });
  const id = "exec-throw-attribution";
  const { events, unsub } = collect(id);
  const conv = fakeConv(() => {}, {
    provider: "google",
    setModel: () => {
      throw new Error("the flux capacitor came loose");
    },
  });

  await execTurn(conv, id, "turn-1", "hey", {
    author: undefined,
    priorAuthors: [],
  });
  unsub();

  expect(persistedProviderError(id)).toEqual({
    kind: "unknown",
    provider: "openai-codex",
    raw_excerpt: "the flux capacitor came loose",
  });
  expect(conv.provider).toBe("google");
  expect(events.some((e) => e.type === "done")).toBe(false);
});

test("an auth throw marks the RESOLVED provider unusable and reports it revoked", async () => {
  resolution.run = () => ({ ...DEFAULT_MODEL, provider: "openai-codex" });
  const id = "exec-throw-auth-attribution";
  const conv = fakeConv(() => {}, {
    provider: "google",
    setModel: () => {
      throw new Error(
        "No API key found for openai-codex.\n\nUse /login to log into a provider via OAuth or API key.",
      );
    },
  });

  await execTurn(conv, id, "turn-1", "hey", {
    author: undefined,
    priorAuthors: [],
  });

  expect(noteAuthFailure).toHaveBeenCalledWith("openai-codex");
  expect(reportRevokedServedToken).toHaveBeenCalledWith(
    expect.objectContaining({ provider: "openai-codex" }),
    undefined,
  );
});

test("an auth throw after a request reports the digest of the token the turn ran on", async () => {
  const { recordUsedToken } = await import("../auth/used-token");
  const { accessDigest } = await import("@houston/protocol/access-digest");
  const id = "exec-throw-used-token";
  const conv = fakeConv(() => {
    recordUsedToken("openai", "the-token-that-401d");
    throw new Error("401 OAuth access token has been revoked");
  });

  await execTurn(conv, id, "turn-1", "hey", {
    author: undefined,
    priorAuthors: [],
  });

  expect(reportRevokedServedToken).toHaveBeenCalledWith(
    expect.objectContaining({ provider: "openai", kind: "unauthenticated" }),
    accessDigest("the-token-that-401d"),
  );
});

test("a resolveModel failure names no provider and never marks or reports one", async () => {
  resolution.run = () => {
    throw new Error("No provider connected. Connect an AI provider first.");
  };
  const id = "exec-throw-unresolved";
  const { events, unsub } = collect(id);
  const conv = fakeConv(() => {}, { provider: "google" });

  await execTurn(conv, id, "turn-1", "hey", {
    author: undefined,
    priorAuthors: [],
  });
  unsub();

  const frame = events.find(
    (e): e is Extract<WireEvent, { type: "provider_error" }> =>
      e.type === "provider_error",
  );
  expect(frame?.data).toMatchObject({
    kind: "unauthenticated",
    cause: "no_credentials",
    provider: "",
  });
  expect(persistedProviderError(id)).toMatchObject({
    kind: "unauthenticated",
    provider: "",
  });
  expect(noteAuthFailure).not.toHaveBeenCalled();
  expect(reportRevokedServedToken).not.toHaveBeenCalled();
});

test("a thrown summarization failure classifies on the RESOLVED model when the turn is unpinned (PRODUCT-1636)", async () => {
  resolution.run = () => ({
    provider: "nvidia",
    id: "meta/llama-3.1-70b-instruct",
    contextWindow: 128_000,
    reasoning: false,
  });
  const id = "exec-throw-summarization";
  const { events, unsub } = collect(id);
  const conv = fakeConv(
    () => {
      throw new Error("Summarization failed: 410 status code (no body)");
    },
    { provider: "openai" },
  );

  await execTurn(conv, id, "turn-1", "hey", {
    author: undefined,
    priorAuthors: [],
  });
  unsub();

  const frame = events.find(
    (e): e is Extract<WireEvent, { type: "provider_error" }> =>
      e.type === "provider_error",
  );
  expect(frame?.data).toMatchObject({
    kind: "model_unavailable",
    provider: "nvidia",
    model: "meta/llama-3.1-70b-instruct",
    suggested_fallback: "minimaxai/minimax-m3.1-flash",
  });
  expect(persistedProviderError(id)).toMatchObject({
    kind: "model_unavailable",
    model: "meta/llama-3.1-70b-instruct",
  });
});

test("a resolveModel failure with a PINNED provider names that provider (canonicalized)", async () => {
  resolution.run = () => {
    throw new Error(
      "No API key found for openai-codex.\n\nUse /login to log into a provider via OAuth or API key.",
    );
  };
  const id = "exec-throw-unresolved-pinned";
  const { events, unsub } = collect(id);
  const conv = fakeConv(() => {}, { provider: "google" });

  await execTurn(
    conv,
    id,
    "turn-1",
    "hey",
    { author: undefined, priorAuthors: [] },
    { provider: "openai", model: "gpt-x" },
  );
  unsub();

  const frame = events.find(
    (e): e is Extract<WireEvent, { type: "provider_error" }> =>
      e.type === "provider_error",
  );
  expect(frame?.data).toMatchObject({
    kind: "unauthenticated",
    provider: "openai-codex",
  });
  expect(persistedProviderError(id)).toMatchObject({
    provider: "openai-codex",
  });
  expect(noteAuthFailure).toHaveBeenCalledWith("openai-codex");
});

test("an unclassifiable resolveModel failure with a pin still names the pinned provider", async () => {
  resolution.run = () => {
    throw new Error('openai-codex model "gpt-1999" is not available');
  };
  const id = "exec-throw-unresolved-pinned-unknown";
  const conv = fakeConv(() => {}, { provider: "google" });

  await execTurn(
    conv,
    id,
    "turn-1",
    "hey",
    { author: undefined, priorAuthors: [] },
    { provider: "openai", model: "gpt-1999" },
  );

  expect(persistedProviderError(id)).toMatchObject({
    provider: "openai-codex",
  });
});

test("an unclassifiable, unpinned resolveModel failure persists the provider as 'unknown'", async () => {
  resolution.run = () => {
    throw new Error("the flux capacitor came loose");
  };
  const id = "exec-throw-unresolved-unknown";
  const conv = fakeConv(() => {}, { provider: "google" });

  await execTurn(conv, id, "turn-1", "hey", {
    author: undefined,
    priorAuthors: [],
  });

  expect(persistedProviderError(id)).toEqual({
    kind: "unknown",
    provider: "unknown",
    raw_excerpt: "the flux capacitor came loose",
  });
  expect(noteAuthFailure).not.toHaveBeenCalled();
  expect(reportRevokedServedToken).not.toHaveBeenCalled();
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

function persistedMeta(id: string) {
  const call = vi
    .mocked(appendAssistantMessage)
    .mock.calls.find((c) => c[0] === id);
  return call?.[2] as
    | { stopped?: true; pendingInteraction?: unknown }
    | undefined;
}

test("a user stop mid-prompt persists stopped:true, drops the pending interaction, and emits no done", async () => {
  const id = "exec-stopped";
  const { events, unsub } = collect(id);
  const conv: Conv = fakeConv((emit) => {
    emit({ type: "text", data: "partial answer" });
    recordQuestions([{ kind: "question", id: "q1", question: "still there?" }]);
    (conv as { stoppedTurnId?: string }).stoppedTurnId = "turn-stop";
  });

  await execTurn(conv, id, "turn-stop", "do it", {
    author: undefined,
    priorAuthors: [],
  });
  unsub();

  expect(events.some((e) => e.type === "done")).toBe(false);
  const meta = persistedMeta(id);
  expect(meta?.stopped).toBe(true);
  expect(meta?.pendingInteraction).toBeUndefined();
  expect((conv as { stoppedTurnId?: string }).stoppedTurnId).toBeUndefined();
});

test("a stopped plan turn never receives the plan fallback", async () => {
  const id = "exec-plan-stop-no-fallback";
  const { events, unsub } = collect(id);
  const conv: Conv = fakeConv((emit) => {
    emit({ type: "text", data: "Partial plan." });
    (conv as { stoppedTurnId?: string }).stoppedTurnId = "turn-stop";
  });

  await execTurn(
    conv,
    id,
    "turn-stop",
    "plan it",
    { author: undefined, priorAuthors: [] },
    { mode: "plan" },
  );
  unsub();

  expect(events.some((e) => e.type === "done")).toBe(false);
  expect(persistedInteraction(id)).toBeUndefined();
});

test("a completed turn (no stop) leaves stopped absent", async () => {
  const id = "exec-not-stopped";
  const conv = fakeConv((emit) => emit({ type: "text", data: "all done" }));
  await execTurn(conv, id, "turn-1", "do it", {
    author: undefined,
    priorAuthors: [],
  });
  expect(persistedMeta(id)?.stopped).toBeUndefined();
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
  expect(persistedInteraction(id)).toBeUndefined();
});

function persistedUserMeta(id: string) {
  const call = vi.mocked(appendUserMessage).mock.calls.find((c) => c[0] === id);
  return call?.[2] as { mentions?: unknown } | undefined;
}

test("recordUserTurn persists the @mentions sidecar AND publishes it on the user frame (HOU-944)", () => {
  const id = "record-mentions";
  const { events, unsub } = collect(id);
  const mentions = [{ userId: "user_a", name: "Ada" }, { userId: "user_g" }];

  recordUserTurn(
    {} as Conv,
    id,
    "turn-1",
    "@Ada can you confirm?",
    "nonce-1",
    undefined,
    undefined,
    mentions,
  );
  unsub();

  expect(persistedUserMeta(id)?.mentions).toEqual(mentions);
  const frame = events.find(
    (e): e is Extract<WireEvent, { type: "user" }> => e.type === "user",
  );
  expect(frame?.data.mentions).toEqual(mentions);
  expect(frame?.data.content).toBe("@Ada can you confirm?");
});

test("recordUserTurn leaves mentions absent on a turn that named nobody", () => {
  const id = "record-no-mentions";
  const { events, unsub } = collect(id);

  recordUserTurn({} as Conv, id, "turn-1", "ship the report");
  unsub();

  expect(persistedUserMeta(id)?.mentions).toBeUndefined();
  const frame = events.find(
    (e): e is Extract<WireEvent, { type: "user" }> => e.type === "user",
  );
  expect(frame?.data.mentions).toBeUndefined();
});

test("a truncation's replay marker prepends the kept transcript to the prompt (PRODUCT-1217)", async () => {
  const id = "exec-truncate-replay";
  const { events, unsub } = collect(id);
  vi.mocked(consumeSessionReplay).mockReturnValueOnce(true);
  vi.mocked(getHistory).mockReturnValue({
    id,
    title: "t",
    messages: [
      { role: "user", content: "Hi", ts: 1, turnId: "t1" },
      {
        role: "assistant",
        content: "Hi, how can I help?",
        ts: 2,
        turnId: "t1",
      },
      {
        role: "user",
        content: "tell me about trains",
        ts: 3,
        turnId: "turn-1",
      },
    ],
  });
  const prompts: string[] = [];
  const conv = fakeConv((emit) => emit({ type: "text", data: "trains!" }), {
    onPrompt: (text) => prompts.push(text),
  });

  await execTurn(conv, id, "turn-1", "tell me about trains", {
    author: undefined,
    priorAuthors: [],
  });
  unsub();
  vi.mocked(getHistory).mockReturnValue({ id, title: "", messages: [] });

  expect(prompts).toHaveLength(1);
  const prompt = prompts[0] ?? "";
  expect(prompt).toContain("User: Hi");
  expect(prompt).toContain("Assistant: Hi, how can I help?");
  expect(prompt).not.toContain("different AI model");
  expect(prompt.match(/tell me about trains/g)).toHaveLength(1);
  expect(prompt.endsWith("tell me about trains")).toBe(true);
  expect(events.find((e) => e.type === "provider_switched")).toBeUndefined();
});

test("without the replay marker the prompt is the bare text (no preamble on normal turns)", async () => {
  const id = "exec-no-replay";
  const prompts: string[] = [];
  const conv = fakeConv((emit) => emit({ type: "text", data: "ok" }), {
    onPrompt: (text) => prompts.push(text),
  });

  await execTurn(conv, id, "turn-1", "hello there", {
    author: undefined,
    priorAuthors: [],
  });

  expect(prompts).toEqual(["hello there"]);
});

test("an approval card reaches the user carrying the host's request id", async () => {
  const id = "exec-confirm";
  const { events, unsub } = collect(id);
  await execTurn(
    fakeConv(() => {
      recordConfirmation({
        question:
          'Delete an agent and everything in it. This affects id "Personal/Dobby". Houston cannot undo this for you. Should I go ahead?',
        options: [
          { id: "approve", label: "Yes, go ahead" },
          { id: "decline", label: "No, don't do it" },
        ],
        requestId: "req-1",
      });
    }),
    id,
    "turn-1",
    "delete Dobby",
    { author: undefined, priorAuthors: [] },
  );
  unsub();

  const done = events.find(
    (e): e is Extract<WireEvent, { type: "done" }> => e.type === "done",
  );
  const step = done?.pendingInteraction?.steps[0];
  if (step?.kind !== "question") throw new Error("no approval card was raised");
  expect(step.question).toContain("Personal/Dobby");
  expect(step.requestId).toBe("req-1");
  expect(step.options?.find((o) => o.id === "approve")).toBeDefined();
});

test("two different requests raise two cards even when they read alike", async () => {
  const id = "exec-confirm-two";
  const { events, unsub } = collect(id);
  const question = `Write a file. The exact content is:\n${"a".repeat(200)}`;
  await execTurn(
    fakeConv(() => {
      recordConfirmation({ question, options: [], requestId: "req-a" });
      recordConfirmation({ question, options: [], requestId: "req-b" });
      recordConfirmation({ question, options: [], requestId: "req-a" });
    }),
    id,
    "turn-1",
    "write both",
    { author: undefined, priorAuthors: [] },
  );
  unsub();

  const done = events.find(
    (e): e is Extract<WireEvent, { type: "done" }> => e.type === "done",
  );
  const steps = done?.pendingInteraction?.steps ?? [];
  expect(
    steps.map((s) => (s.kind === "question" ? s.requestId : null)),
  ).toEqual(["req-a", "req-b"]);
});

const { readInflightMarker } = await import("./turn-inflight-marker");
const { config } = await import("../config");

test("the in-flight marker lives from the user message to the turn's end and names the running tool", async () => {
  const id = "exec-inflight-clean";
  const seen: Array<ReturnType<typeof readInflightMarker>> = [];
  const conv = fakeConv((emit) => {
    seen.push(readInflightMarker(config.dataDir, id));
    emit({ type: "tool_start", data: { name: "bash", args: { cmd: "ls" } } });
    seen.push(readInflightMarker(config.dataDir, id));
    emit({
      type: "tool_end",
      data: { name: "bash", isError: false, content: "ok" },
    });
    emit({ type: "text", data: "done" });
  });
  const recorded = recordUserTurn(conv, id, "turn-inflight", "run it");
  expect(readInflightMarker(config.dataDir, id)).toMatchObject({
    conversationId: id,
    turnId: "turn-inflight",
  });
  await execTurn(conv, id, "turn-inflight", "run it", recorded);
  expect(seen[0]).toMatchObject({ turnId: "turn-inflight" });
  expect(seen[0]?.tool).toBeUndefined();
  expect(seen[1]?.tool).toBe("bash");
  expect(readInflightMarker(config.dataDir, id)).toBeNull();
});

test("a thrown turn clears the in-flight marker too", async () => {
  const id = "exec-inflight-thrown";
  const conv = fakeConv(() => {}, {
    setModel: () => {
      throw new Error("boom");
    },
  });
  const recorded = recordUserTurn(conv, id, "turn-thrown", "go");
  expect(readInflightMarker(config.dataDir, id)).not.toBeNull();
  await execTurn(conv, id, "turn-thrown", "go", recorded);
  expect(readInflightMarker(config.dataDir, id)).toBeNull();
});
