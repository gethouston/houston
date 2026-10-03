import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WireEvent } from "@houston/runtime-client";
import { afterEach, expect, test, vi } from "vitest";
import type {
  CreateSessionOptions,
  HarnessBackend,
  HarnessSession,
  ModelPhase,
  ResolvedModel,
} from "../backends/types";

/**
 * Stalled-provider resilience: a turn whose provider stream goes silent must (a) be
 * aborted and surfaced as a typed error rather than holding the workdir lock
 * forever, and (b) its user message must be durable + visible the instant the
 * turn is accepted, even while another conversation holds the lock.
 */

// Point config at throwaway dirs + a short stall window BEFORE the module graph
// loads (config reads env at import; conversation-cache wires backends at load).
process.env.HOUSTON_DATA_DIR = mkdtempSync(
  join(tmpdir(), "houston-resilience-data-"),
);
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-resilience-ws-"),
);
process.env.HOUSTON_TURN_STALL_TIMEOUT_MS = "5000";
// Unanswered cut = 3 deadlines and a third: 600 ms -> 2,000 ms.
process.env.HOUSTON_TURN_FIRST_BYTE_DEADLINE_MS = "600";

const STALL_MS = 5000;
const FIRST_RESPONSE_MS = 2000;

const state = vi.hoisted(() => ({
  model: null as ResolvedModel | null,
  provider: null as string | null,
}));
vi.mock("../ai/providers", async (importOriginal) => {
  const real = await importOriginal<typeof import("../ai/providers")>();
  return {
    ...real,
    resolveModel: () => state.model,
    activeProvider: () => state.provider,
    activeEffort: () => null,
  };
});

// Import AFTER the mocks + env so the backend graph + config use them.
await import("./conversation-cache");
const { execTurn } = await import("./exec-turn");
const { runTurn } = await import("./chat");
const { subscribe } = await import("./bus");
const { getHistory, appendUserMessage } = await import(
  "../store/conversations"
);
const { withWorkdirLock } = await import("./workdir-lock");
const { setDefaultBackend } = await import("../backends/registry");
const { config } = await import("../config");
type Conversation = import("./conversation-cache").Conversation;

const OPENAI: ResolvedModel = {
  provider: "openai-codex",
  id: "gpt-5-codex",
  contextWindow: 400_000,
};

/** A session whose prompt() hangs (a stalled provider stream) until abort() is
 *  called — pi's own behavior once its request signal fires. Emits nothing. */
class StallSession implements HarnessSession {
  aborted = false;
  private listeners = new Set<(e: WireEvent) => void>();
  private resolvePrompt: (() => void) | undefined;
  subscribe(l: (e: WireEvent) => void): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
  prompt(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.resolvePrompt = resolve;
    });
  }
  async abort(): Promise<void> {
    this.aborted = true;
    this.resolvePrompt?.();
  }
  dispose(): void {
    this.listeners.clear();
  }
  async setModel(): Promise<void> {}
  async compact(): Promise<undefined> {}
  setThinkingLevel(): void {}
  getContextUsage(): { tokens: number | null } {
    return { tokens: 100 };
  }
}

/** pi's REAL shape for a watchdog abort that lands while the response is still
 *  pending: the request's AbortError comes back as an errored assistant turn,
 *  which the wire classifies as an `unknown` provider_error ("This operation
 *  was aborted") BEFORE prompt() resolves. Emits nothing until then. */
class StallEchoSession implements HarnessSession {
  aborted = false;
  private listeners = new Set<(e: WireEvent) => void>();
  private resolvePrompt: (() => void) | undefined;
  subscribe(l: (e: WireEvent) => void): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
  prompt(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.resolvePrompt = resolve;
    });
  }
  async abort(): Promise<void> {
    this.aborted = true;
    for (const l of this.listeners)
      l({
        type: "provider_error",
        data: {
          kind: "unknown",
          provider: "azure-openai-responses",
          raw_excerpt: "This operation was aborted",
        },
      });
    this.resolvePrompt?.();
  }
  dispose(): void {
    this.listeners.clear();
  }
  async setModel(): Promise<void> {}
  async compact(): Promise<undefined> {}
  setThinkingLevel(): void {}
  getContextUsage(): { tokens: number | null } {
    return { tokens: 100 };
  }
}

/** A session whose model spends longer than the stall window streaming a tool
 *  call's INPUT — pure toolcall_delta traffic, which maps to no WireEvent — and
 *  then answers. Only the liveness channel ticks during that stretch. */
class ToolInputSession implements HarnessSession {
  aborted = false;
  private listeners = new Set<(e: WireEvent) => void>();
  private liveness = new Set<() => void>();
  subscribe(l: (e: WireEvent) => void): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
  subscribeLiveness(l: () => void): () => void {
    this.liveness.add(l);
    return () => {
      this.liveness.delete(l);
    };
  }
  async prompt(): Promise<void> {
    // Three stall windows of tool-input deltas, each tick well inside the
    // window: the wire stays silent the whole time.
    for (let i = 0; i < 6; i++) {
      await new Promise<void>((r) => setTimeout(r, STALL_MS / 2));
      for (const l of this.liveness) l();
    }
    for (const l of this.listeners) l({ type: "text", data: "written" });
  }
  async abort(): Promise<void> {
    this.aborted = true;
  }
  dispose(): void {
    this.listeners.clear();
    this.liveness.clear();
  }
  async setModel(): Promise<void> {}
  async compact(): Promise<undefined> {
    return undefined;
  }
  setThinkingLevel(): void {}
  getContextUsage(): { tokens: number | null } {
    return { tokens: 100 };
  }
}

/** A StallSession that reports its request going out: the response never
 *  opens, so the unanswered cut applies, not the quiet-stream one. */
class UnansweredSession extends StallSession {
  private phases = new Set<(p: ModelPhase) => void>();
  subscribeModelPhase(l: (p: ModelPhase) => void): () => void {
    this.phases.add(l);
    return () => {
      this.phases.delete(l);
    };
  }
  override prompt(): Promise<void> {
    for (const p of this.phases)
      p({ phase: "requesting", provider: "openai-codex" });
    return super.prompt();
  }
}

/** A session whose reply loops ("SymbolSymbol…") until aborted, after a 429
 *  pi retried: pi flushes that held failure once the aborted prompt settles. */
class LoopingSession extends StallSession {
  private wire = new Set<(e: WireEvent) => void>();
  override subscribe(l: (e: WireEvent) => void): () => void {
    this.wire.add(l);
    const unsub = super.subscribe(l);
    return () => {
      this.wire.delete(l);
      unsub();
    };
  }
  override prompt(): Promise<void> {
    const settled = super.prompt();
    for (let i = 0; i < 200 && !this.aborted; i++)
      for (const l of this.wire) l({ type: "text", data: "Symbol".repeat(20) });
    return settled;
  }
  override async abort(): Promise<void> {
    for (const l of this.wire)
      l({
        type: "provider_error",
        data: {
          kind: "rate_limited",
          provider: "openai-codex",
          model: null,
          retry_after_seconds: null,
          message: "429 Too Many Requests",
        },
      });
    await super.abort();
  }
}

/** A trivial session that answers instantly — stands in for a healthy backend so
 *  runTurn can build a conversation without a network. */
class QuietSession implements HarnessSession {
  private listeners = new Set<(e: WireEvent) => void>();
  subscribe(l: (e: WireEvent) => void): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
  async prompt(): Promise<void> {}
  async abort(): Promise<void> {}
  dispose(): void {
    this.listeners.clear();
  }
  async setModel(): Promise<void> {}
  async compact(): Promise<undefined> {}
  setThinkingLevel(): void {}
  getContextUsage(): { tokens: number | null } {
    return { tokens: 0 };
  }
}

function convWith(session: HarnessSession): Conversation {
  return {
    session,
    queue: Promise.resolve(),
    provider: "openai-codex",
    model: "gpt-5-codex",
    backendId: "pi",
    mode: "execute",
  } as unknown as Conversation;
}

function quietBackend(): HarnessBackend {
  return {
    id: "pi",
    async createSession(_opts: CreateSessionOptions): Promise<HarnessSession> {
      return new QuietSession();
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  state.model = null;
  state.provider = null;
});

test("a turn whose provider goes silent is aborted at the stall window and surfaces a typed network error, never a clean done", async () => {
  vi.useFakeTimers();
  state.model = OPENAI;
  const session = new StallSession();
  const conv = convWith(session);

  const events: WireEvent[] = [];
  const unsub = subscribe("conv-stall", (e) => events.push(e));
  const done = execTurn(conv, "conv-stall", "turn-1", "hi", {
    author: undefined,
    priorAuthors: [],
  });

  // Let execTurn reach prompt() and arm the watchdog; the stream stays silent.
  await vi.advanceTimersByTimeAsync(0);
  expect(session.aborted).toBe(false);

  // Cross the stall window: the watchdog aborts, which unblocks prompt().
  await vi.advanceTimersByTimeAsync(STALL_MS);
  await done;
  unsub();

  expect(session.aborted).toBe(true);
  const pe = events.find(
    (e): e is Extract<WireEvent, { type: "provider_error" }> =>
      e.type === "provider_error",
  );
  // A provider-side fault (the socket was live; it went silent), not the user's
  // connectivity — see the card-copy rationale in exec-turn.ts.
  expect(pe?.data.kind).toBe("provider_internal");
  // No false success: the empty turn must NOT settle as done.
  expect(events.some((e) => e.type === "done")).toBe(false);
});

test("a stalled turn whose abort echoes back as an unclassifiable provider error still surfaces the typed stall card, once (PRODUCT-1778)", async () => {
  vi.useFakeTimers();
  state.model = OPENAI;
  const session = new StallEchoSession();
  const conv = convWith(session);
  appendUserMessage("conv-stall-echo", "hi", { turnId: "turn-echo" });

  const events: WireEvent[] = [];
  const unsub = subscribe("conv-stall-echo", (e) => events.push(e));
  const done = execTurn(conv, "conv-stall-echo", "turn-echo", "hi", {
    author: undefined,
    priorAuthors: [],
  });

  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(STALL_MS);
  await done;
  unsub();

  expect(session.aborted).toBe(true);
  const errors = events.filter(
    (e): e is Extract<WireEvent, { type: "provider_error" }> =>
      e.type === "provider_error",
  );
  // Exactly one card, and it is the honest one: "stopped responding", not
  // "Houston could not classify this Azure OpenAI error / This operation was
  // aborted" (the echo of our own abort).
  expect(errors).toHaveLength(1);
  expect(errors[0]?.data.kind).toBe("provider_internal");
  expect(events.some((e) => e.type === "done")).toBe(false);
  // The persisted reply carries the same typed error, so a reload agrees.
  const messages = getHistory("conv-stall-echo")?.messages ?? [];
  expect(messages.at(-1)?.providerError?.kind).toBe("provider_internal");
});

test("a turn streaming a long tool input (wire-silent, liveness ticking) is never aborted as stalled (PRODUCT-1632)", async () => {
  vi.useFakeTimers();
  state.model = OPENAI;
  const session = new ToolInputSession();
  const conv = convWith(session);

  const events: WireEvent[] = [];
  const unsub = subscribe("conv-tool-input", (e) => events.push(e));
  const done = execTurn(conv, "conv-tool-input", "turn-1", "write it", {
    author: undefined,
    priorAuthors: [],
  });

  // Well past the stall window — 3x — with only tool-input deltas flowing.
  await vi.advanceTimersByTimeAsync(STALL_MS * 3 + 1);
  await done;
  unsub();

  expect(session.aborted).toBe(false);
  expect(events.some((e) => e.type === "provider_error")).toBe(false);
  expect(events.some((e) => e.type === "text")).toBe(true);
  expect(events.some((e) => e.type === "done")).toBe(true);
});

test("a turn both stalled AND stopped settles as a user stop, never a synthesized provider error", async () => {
  vi.useFakeTimers();
  state.model = OPENAI;
  const session = new StallSession();
  const conv = convWith(session);
  // The user hit Stop on THIS turn: cancelTurn stamps the marker before aborting.
  // Its abort resolves the stalled prompt() the same way the watchdog's does, so
  // both signals land on the one turn — a user Stop must win over the watchdog.
  (conv as { stoppedTurnId?: string }).stoppedTurnId = "turn-stop";
  // Seed the conversation file so execTurn's assistant-message persist lands
  // (appendAssistantMessage no-ops on a conversation that was never created).
  appendUserMessage("conv-stall-stop", "hi", { turnId: "turn-stop" });

  const events: WireEvent[] = [];
  const unsub = subscribe("conv-stall-stop", (e) => events.push(e));
  const done = execTurn(conv, "conv-stall-stop", "turn-stop", "hi", {
    author: undefined,
    priorAuthors: [],
  });

  await vi.advanceTimersByTimeAsync(0);
  // Cross the stall window: the watchdog fires (stalled) on a turn the user also
  // stopped. The synthesized provider_internal must be suppressed.
  await vi.advanceTimersByTimeAsync(STALL_MS);
  await done;
  unsub();

  // No synthesized provider error frame — the stop is the terminal surface.
  expect(events.some((e) => e.type === "provider_error")).toBe(false);
  // No clean done either (a stopped turn never settles as a success).
  expect(events.some((e) => e.type === "done")).toBe(false);
  // The persisted message records the stop and carries NO provider error.
  const messages = getHistory("conv-stall-stop")?.messages ?? [];
  const last = messages[messages.length - 1];
  expect(last?.stopped).toBe(true);
  expect(last?.providerError).toBeUndefined();
});

test("a user-stopped turn whose abort echoes back as an unclassifiable provider error settles as a plain stop (PRODUCT-1778)", async () => {
  vi.useFakeTimers();
  state.model = OPENAI;
  const session = new StallEchoSession();
  const conv = convWith(session);
  (conv as { stoppedTurnId?: string }).stoppedTurnId = "turn-stop-echo";
  appendUserMessage("conv-stop-echo", "hi", { turnId: "turn-stop-echo" });

  const events: WireEvent[] = [];
  const unsub = subscribe("conv-stop-echo", (e) => events.push(e));
  const done = execTurn(conv, "conv-stop-echo", "turn-stop-echo", "hi", {
    author: undefined,
    priorAuthors: [],
  });

  await vi.advanceTimersByTimeAsync(0);
  // cancelTurn's abort resolves the pending prompt() the same way; pi echoes
  // the AbortError as an errored turn first.
  await session.abort();
  await done;
  unsub();

  // No red card over the stop: not the echo, not a synthesized stall error.
  expect(events.some((e) => e.type === "provider_error")).toBe(false);
  expect(events.some((e) => e.type === "done")).toBe(false);
  const last = (getHistory("conv-stop-echo")?.messages ?? []).at(-1);
  expect(last?.stopped).toBe(true);
  expect(last?.providerError).toBeUndefined();
});

test("a queued message is persisted + visible BEFORE the workdir lock frees — a stalled turn on another conversation can't hide it", async () => {
  state.model = OPENAI;
  state.provider = "openai-codex";
  setDefaultBackend(quietBackend());

  // Occupy the shared per-workspace turn lock with a turn that never finishes —
  // the production incident's stalled routine.
  let release: (() => void) | undefined;
  const held = withWorkdirLock(
    config.workspaceDir,
    () =>
      new Promise<void>((r) => {
        release = r;
      }),
  );

  // Start a turn on a DIFFERENT, brand-new conversation. Its user message must
  // land + become visible immediately, then it blocks on the lock — not the
  // reverse (which is what made the message vanish for minutes before the fix).
  const turn = runTurn("conv-visible", "are you there?");

  await vi.waitFor(() => {
    expect(getHistory("conv-visible")?.messages?.[0]).toMatchObject({
      role: "user",
      content: "are you there?",
    });
  });
  // The turn itself is still parked on the lock: user message only, no reply yet.
  expect(getHistory("conv-visible")?.messages).toHaveLength(1);

  // Release the lock and let the turn settle so nothing leaks into later tests.
  release?.();
  await held;
  await turn.catch(() => {});
});

test("a request whose response never opens is cut once its retries have had their deadlines, well before the stall window", async () => {
  vi.useFakeTimers();
  state.model = OPENAI;
  const session = new UnansweredSession();
  const conv = convWith(session);

  const events: WireEvent[] = [];
  const unsub = subscribe("conv-unanswered", (e) => events.push(e));
  const done = execTurn(conv, "conv-unanswered", "turn-u", "hi", {
    author: undefined,
    priorAuthors: [],
  });

  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(FIRST_RESPONSE_MS - 1);
  expect(session.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await done;
  unsub();

  expect(session.aborted).toBe(true);
  const pe = events.find(
    (e): e is Extract<WireEvent, { type: "provider_error" }> =>
      e.type === "provider_error",
  );
  expect(pe?.data).toMatchObject({
    kind: "provider_internal",
    message: expect.stringContaining("did not start answering"),
  });
  expect(events.some((e) => e.type === "done")).toBe(false);
});

test("a looping reply settles on the broken-response card, never a failure pi had already retried", async () => {
  vi.useFakeTimers();
  state.model = OPENAI;
  const session = new LoopingSession();
  const conv = convWith(session);
  appendUserMessage("conv-loop", "hi", { turnId: "turn-loop" });

  const events: WireEvent[] = [];
  const unsub = subscribe("conv-loop", (e) => events.push(e));
  const done = execTurn(conv, "conv-loop", "turn-loop", "hi", {
    author: undefined,
    priorAuthors: [],
  });
  await vi.advanceTimersByTimeAsync(0);
  await done;
  unsub();

  expect(session.aborted).toBe(true);
  const kinds = events
    .filter(
      (e): e is Extract<WireEvent, { type: "provider_error" }> =>
        e.type === "provider_error",
    )
    .map((e) => e.data.kind);
  expect(kinds).toEqual(["malformed_response"]);
  expect(getHistory("conv-loop")?.messages.at(-1)?.providerError?.kind).toBe(
    "malformed_response",
  );
});
