import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WireEvent } from "@houston/runtime-client";
import { afterEach, expect, test, vi } from "vitest";
import type {
  CreateSessionOptions,
  HarnessBackend,
  HarnessSession,
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

const STALL_MS = 5000;

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
  async compact(): Promise<void> {}
  setThinkingLevel(): void {}
  getContextUsage(): { tokens: number | null } {
    return { tokens: 100 };
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
  async compact(): Promise<void> {}
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
