import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WireEvent } from "@houston/runtime-client";
import { afterAll, afterEach, expect, test, vi } from "vitest";
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
// keep every other providers export intact for the import graph. `resolveModel`
// reads a hoisted ref so a test can make the RESOLUTION itself fail (the one
// case where a turn genuinely has no provider to name).
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

// The credential status surface + the control-plane revocation report are both
// driven from execTurn's catch; spy on them to prove a mis-resolved turn never
// marks (or signs out) a provider it never ran on.
vi.mock("../auth/credential-health", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("../auth/credential-health")>();
  return { ...real, noteAuthFailure: vi.fn(), clearAuthFailure: vi.fn() };
});
vi.mock("../auth/report-revoked", () => ({
  reportRevokedServedToken: vi.fn(),
}));

// Stub the backend seam (no rebuild) — and, crucially, avoid conversation-cache's
// module-load side effects (which build the real pi + Claude backends).
vi.mock("./conversation-cache", () => ({
  switchBackendIfNeeded: vi.fn(async () => ({
    rebuilt: false,
    preTokens: null,
  })),
  switchModeIfNeeded: vi.fn(async () => ({ rebuilt: false })),
  // The revoked-token eviction (PRODUCT-1355) peeks the live cache in the
  // turn's finally; these frame-contract tests run on non-Claude convs, so a
  // minimal empty stand-in is enough.
  conversations: { peek: () => undefined, delete: () => false },
}));

// The durable store is irrelevant to the frame contract under test.
vi.mock("../store/conversations", () => ({
  appendUserMessage: vi.fn(),
  appendAssistantMessage: vi.fn(),
  getHistory: vi.fn(() => ({ messages: [] })),
  consumeSessionReplay: vi.fn(() => false),
}));

const { execTurn, recordUserTurn } = await import("./exec-turn");
const { subscribe } = await import("./bus");
const { recordQuestions, recordConnection } = await import("./interaction");
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

/** The pendingInteraction persisted on `id`'s assistant message, or undefined. */
function persistedInteraction(id: string): unknown {
  const call = vi
    .mocked(appendAssistantMessage)
    .mock.calls.find((c) => c[0] === id);
  return (call?.[2] as { pendingInteraction?: unknown } | undefined)
    ?.pendingInteraction;
}

type Conv = Parameters<typeof execTurn>[0];

/**
 * A minimal Conversation whose session runs `script` when prompted.
 * `opts.provider` seeds the CACHED session's last provider (the stale value the
 * error path must never attribute a failure to) and `opts.setModel` lets a test
 * fail the turn at the mid-turn re-point, i.e. BEFORE `conv.provider` is
 * rewritten.
 */
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
    async compact() {},
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
  const conv = fakeConv(() => {
    // No text frames at all: the model only ran tools and went silent.
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
  expect(done?.pendingInteraction).toBeUndefined();
  expect(persistedInteraction(id)).toBeUndefined();
});

test("a mid-turn execute-to-plan flip still receives the plan fallback", async () => {
  const id = "exec-flip-plan-fallback";
  const { events, unsub } = collect(id);
  // The Mode-pill flip lands on conv.liveMode while the turn runs; the
  // execute-built toolset has no plan_ready, so the backstop must fire.
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

/**
 * WHO a thrown turn is blamed on. The turn re-resolves its model every time, so
 * a failure between that resolution and the `conv.provider` write belongs to the
 * RESOLVED provider — `conv.provider` still holds whatever the cached session
 * last ran on, which for a fresh conversation is the registry-order fallback.
 * Blaming it put "Connect Gemini" cards in front of GPT-5.6 users and, on an
 * auth throw, marked the innocent provider unusable workspace-wide.
 */
test("a throw before the provider write is attributed to the RESOLVED provider, never the cached one", async () => {
  resolution.run = () => ({ ...DEFAULT_MODEL, provider: "openai-codex" });
  const id = "exec-throw-attribution";
  const { events, unsub } = collect(id);
  // The session was built on google; this turn resolved onto openai-codex and
  // dies at the mid-turn re-point — before `conv.provider` is rewritten.
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
  // The stale cached provider never reaches the card.
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

  // Symmetry with the clean path's clearAuthFailure(model.provider).
  expect(noteAuthFailure).toHaveBeenCalledWith("openai-codex");
  // The throw happened BEFORE any request read a credential, so the used
  // token is unknown — passed as such, and the reporter's unknown-token gate
  // skips rather than deleting an unverified target (PRODUCT-1319).
  expect(reportRevokedServedToken).toHaveBeenCalledWith(
    expect.objectContaining({ provider: "openai-codex" }),
    undefined,
  );
});

/**
 * PRODUCT-1319: a throw AFTER the turn's requests ran (e.g. pi rejecting the
 * prompt once the provider confirmed a revocation) must report the token those
 * requests actually used — recorded into the turn's capture by the credential
 * store at request time, and still readable from the catch after the prompt's
 * async subtree unwound.
 */
test("an auth throw after a request reports the digest of the token the turn ran on", async () => {
  const { recordUsedToken } = await import("../auth/used-token");
  const { accessDigest } = await import("@houston/protocol/access-digest");
  const id = "exec-throw-used-token";
  const conv = fakeConv(() => {
    // Stands in for the credential store's request-time read, which runs
    // inside prompt() — i.e. inside the turn's used-token capture.
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

/**
 * The one turn with no honest provider to name: `resolveModel` itself failed, so
 * the turn ran on NOTHING. It reports the empty id (chat.ts's pre-session
 * failure emits the same shape, and the client renders the generic "connect an
 * AI provider" card) and must touch neither the credential status surface nor
 * the control plane — marking "" unusable, or POSTing a revocation for it, is
 * the corruption this guard exists to prevent.
 */
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

/**
 * ...but a turn that CARRIED a pin is not provider-less: the pin is the user's
 * own statement of what to run on, honest evidence even when the resolution
 * failed (a routine pinned to a provider whose saved model id went stale). The
 * canonical id is what every consumer keys on, so the pin is canonicalized the
 * same way `resolveModel` would have.
 */
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
  // "openai" is the pin's alias for the Codex row — canonical, as resolveModel
  // would have resolved it.
  expect(frame?.data).toMatchObject({
    kind: "unauthenticated",
    provider: "openai-codex",
  });
  expect(persistedProviderError(id)).toMatchObject({
    provider: "openai-codex",
  });
  // A NAMED provider unlocks the status surface too: the pinned credential is
  // the one that is missing, so "Connected" would be a lie for it.
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

  // An empty provider on the unknown card renders "is not available on your
  //  account" (double space) — the pin is the honest label.
  expect(persistedProviderError(id)).toMatchObject({
    provider: "openai-codex",
  });
});

/**
 * With NO pin and nothing to classify, the unknown card still needs a word to
 * interpolate: `""` renders "could not classify this  error" and a
 * `provider_error:unknown:` report id. `"unknown"` is the same choice chat.ts
 * makes for its pre-session unknown failure.
 */
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
  // Still nothing to mark or sign out: the turn ran on no credential.
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

/** The meta persisted on `id`'s assistant message, or undefined. */
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
  // `conv` is referenced inside the prompt script, which only runs once execTurn
  // calls prompt() — by then conv is assigned, so a const closure is safe.
  const conv: Conv = fakeConv((emit) => {
    emit({ type: "text", data: "partial answer" });
    // The model queued a question, but the user hit Stop mid-turn.
    recordQuestions([{ kind: "question", id: "q1", question: "still there?" }]);
    // cancelTurn stamps this on the conversation before aborting; pi resolves
    // the aborted prompt() clean, so this marker is the only trace of the stop.
    (conv as { stoppedTurnId?: string }).stoppedTurnId = "turn-stop";
  });

  await execTurn(conv, id, "turn-stop", "do it", {
    author: undefined,
    priorAuthors: [],
  });
  unsub();

  // No clean done — cancelTurn's live "Stopped by user" frame is the terminal
  // surface; a done on top would race the client's settle.
  expect(events.some((e) => e.type === "done")).toBe(false);
  const meta = persistedMeta(id);
  // The durable stop marker survives so a reload renders the standard line...
  expect(meta?.stopped).toBe(true);
  // ...and a stopped turn never carries a pending interaction (the user walked
  // away mid-ask; nothing should re-render a card).
  expect(meta?.pendingInteraction).toBeUndefined();
  // The marker is cleared so it never bleeds into the next turn.
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
  // A thrown turn settles via the catch path, which never carries the interaction.
  expect(persistedInteraction(id)).toBeUndefined();
});

/** The meta persisted on `id`'s USER message, or undefined. */
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

  // Durable: a reader that refetches history maps "@Ada" back to a person.
  expect(persistedUserMeta(id)?.mentions).toEqual(mentions);
  // Live: a client watching the stream chips them without refetching.
  const frame = events.find(
    (e): e is Extract<WireEvent, { type: "user" }> => e.type === "user",
  );
  expect(frame?.data.mentions).toEqual(mentions);
  // The model input is untouched — the names were always plain text.
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
      // The current turn's own (edited) user message is already recorded when
      // execTurn runs — the replay must NOT double it into the preamble.
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
  // The kept turns ride the prompt as the replay preamble...
  expect(prompt).toContain("User: Hi");
  expect(prompt).toContain("Assistant: Hi, how can I help?");
  // ...with the RESET header, never the provider-switch framing...
  expect(prompt).not.toContain("different AI model");
  // ...the edited message itself appears exactly once (it IS the prompt)...
  expect(prompt.match(/tell me about trains/g)).toHaveLength(1);
  expect(prompt.endsWith("tell me about trains")).toBe(true);
  // ...and no provider_switched divider is drawn for a same-backend rewind.
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
