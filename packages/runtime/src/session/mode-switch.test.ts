import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TurnMode } from "@houston/protocol";
import type { WireEvent } from "@houston/runtime-client";
import { afterEach, expect, test, vi } from "vitest";
import type {
  CreateSessionOptions,
  HarnessBackend,
  HarnessSession,
  ResolvedModel,
} from "../backends/types";

/**
 * PLAN MODE — the per-turn mode flip rebuilds the session read-only while
 * preserving history, emits no provider_switched frame, and a cross-backend
 * switch that ALSO flips mode lands on the requested mode in ONE rebuild.
 *
 * History carryover is the load-bearing guarantee: a real backend reopens THIS
 * conversation's persisted session by id on rebuild (pi via continueRecent, the
 * Claude store keyed by conversationId), so prior turns rehydrate. The fake
 * backend here models that with a per-conversation "disk" the rebuilt session
 * re-attaches to — proving switchModeIfNeeded keys the rebuild by conversationId
 * and clears nothing.
 */

process.env.HOUSTON_DATA_DIR = mkdtempSync(
  join(tmpdir(), "houston-mode-data-"),
);
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-mode-ws-"),
);

const modelState = vi.hoisted(() => ({ model: null as ResolvedModel | null }));
vi.mock("../ai/providers", async (importOriginal) => {
  const real = await importOriginal<typeof import("../ai/providers")>();
  return {
    ...real,
    resolveModel: () => modelState.model,
    activeEffort: () => null,
  };
});

await import("./conversation-cache");
const { execTurn } = await import("./exec-turn");
const { switchModeIfNeeded, getConversation, conversations } = await import(
  "./conversation-cache"
);
const { registerBackend, setDefaultBackend } = await import(
  "../backends/registry"
);
const { subscribe } = await import("./bus");
type Conversation = import("./conversation-cache").Conversation;

/**
 * A session backed by a shared per-conversation "disk": its `prompts` array is
 * the conversation's transcript, so a rebuilt session for the same id re-attaches
 * to the SAME transcript — modeling on-disk rehydration (continueRecent / the
 * Claude store). Records the mode it was built at + dispose.
 */
class HistSession implements HarnessSession {
  disposed = false;
  private listeners = new Set<(e: WireEvent) => void>();
  constructor(
    readonly backendId: string,
    readonly builtMode: TurnMode,
    readonly prompts: string[],
  ) {}
  subscribe(l: (e: WireEvent) => void): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
  async prompt(text: string): Promise<void> {
    this.prompts.push(text);
  }
  async abort(): Promise<void> {}
  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }
  async setModel(): Promise<void> {}
  async compact(): Promise<void> {}
  setThinkingLevel(): void {}
  getContextUsage(): { tokens: number | null } {
    return { tokens: 0 };
  }
}

/** A backend whose sessions rehydrate from a shared per-conversation disk. */
function histBackend(
  id: string,
  disk: Map<string, string[]>,
  built: HistSession[],
): HarnessBackend {
  return {
    id,
    async createSession(opts: CreateSessionOptions): Promise<HarnessSession> {
      const transcript = disk.get(opts.conversationId) ?? [];
      disk.set(opts.conversationId, transcript);
      const s = new HistSession(id, opts.mode ?? "execute", transcript);
      built.push(s);
      return s;
    },
  };
}

afterEach(() => {
  modelState.model = null;
  conversations.clear();
});

const OPENAI: ResolvedModel = {
  provider: "openai-codex",
  id: "gpt-5-codex",
  contextWindow: 400_000,
};
const ANTHROPIC: ResolvedModel = {
  provider: "anthropic",
  id: "claude-sonnet-4-5",
  contextWindow: 200_000,
};

test("switchModeIfNeeded no-ops when the mode is unchanged", async () => {
  const disk = new Map<string, string[]>();
  const built: HistSession[] = [];
  setDefaultBackend(histBackend("pi", disk, built));
  const session = new HistSession("pi", "execute", []);
  const conv = {
    session,
    queue: Promise.resolve(),
    provider: "openai-codex",
    model: "gpt-5-codex",
    backendId: "pi",
    mode: "execute",
  } as unknown as Conversation;

  const res = await switchModeIfNeeded(conv, "c", OPENAI, "execute");
  expect(res.rebuilt).toBe(false);
  expect(session.disposed).toBe(false);
  expect(conv.session).toBe(session);
  expect(built).toHaveLength(0);
});

test("switchModeIfNeeded rebuilds on a flip and the rebuilt session keeps prior history", async () => {
  const disk = new Map<string, string[]>([["c", ["earlier turn"]]]);
  const built: HistSession[] = [];
  setDefaultBackend(histBackend("pi", disk, built));
  const session = new HistSession("pi", "execute", disk.get("c") as string[]);
  const conv = {
    session,
    queue: Promise.resolve(),
    provider: "openai-codex",
    model: "gpt-5-codex",
    backendId: "pi",
    mode: "execute",
  } as unknown as Conversation;

  const res = await switchModeIfNeeded(conv, "c", OPENAI, "plan");
  expect(res.rebuilt).toBe(true);
  expect(session.disposed).toBe(true);
  expect(conv.mode).toBe("plan");
  expect(built).toHaveLength(1);
  // Rebuilt read-only, and the prior turn rehydrated (same conversation disk).
  expect(built[0].builtMode).toBe("plan");
  expect(built[0].prompts).toEqual(["earlier turn"]);
  // A flip back to execute rebuilds again and still sees the history.
  const back = await switchModeIfNeeded(conv, "c", OPENAI, "execute");
  expect(back.rebuilt).toBe(true);
  expect(conv.mode).toBe("execute");
  expect(built[1].builtMode).toBe("execute");
  expect(built[1].prompts).toEqual(["earlier turn"]);
});

test("switchModeIfNeeded rebuilds execute→auto and the rebuilt session keeps prior history", async () => {
  const disk = new Map<string, string[]>([["c", ["earlier turn"]]]);
  const built: HistSession[] = [];
  setDefaultBackend(histBackend("pi", disk, built));
  const session = new HistSession("pi", "execute", disk.get("c") as string[]);
  const conv = {
    session,
    queue: Promise.resolve(),
    provider: "openai-codex",
    model: "gpt-5-codex",
    backendId: "pi",
    mode: "execute",
  } as unknown as Conversation;

  const res = await switchModeIfNeeded(conv, "c", OPENAI, "auto");
  expect(res.rebuilt).toBe(true);
  expect(session.disposed).toBe(true);
  expect(conv.mode).toBe("auto");
  expect(built).toHaveLength(1);
  // Rebuilt at auto, prior turn rehydrated (same conversation disk).
  expect(built[0].builtMode).toBe("auto");
  expect(built[0].prompts).toEqual(["earlier turn"]);
  // A flip auto→plan rebuilds again and still sees the history — the switch is
  // value-agnostic across all three modes.
  const toPlan = await switchModeIfNeeded(conv, "c", OPENAI, "plan");
  expect(toPlan.rebuilt).toBe(true);
  expect(conv.mode).toBe("plan");
  expect(built[1].builtMode).toBe("plan");
  expect(built[1].prompts).toEqual(["earlier turn"]);
});

test("getConversation records the pin's mode and builds the session at it", async () => {
  const disk = new Map<string, string[]>();
  const built: HistSession[] = [];
  setDefaultBackend(histBackend("pi", disk, built));
  modelState.model = OPENAI;

  const conv = await getConversation("c-init", {
    provider: "openai-codex",
    model: "gpt-5-codex",
    mode: "plan",
  });
  expect(conv.mode).toBe("plan");
  expect(built).toHaveLength(1);
  expect(built[0].builtMode).toBe("plan");
});

test("getConversation defaults to execute when the pin sets no mode", async () => {
  const disk = new Map<string, string[]>();
  const built: HistSession[] = [];
  setDefaultBackend(histBackend("pi", disk, built));
  modelState.model = OPENAI;

  const conv = await getConversation("c-default", {});
  expect(conv.mode).toBe("execute");
  expect(built[0].builtMode).toBe("execute");
});

test("a mode-only flip through execTurn rebuilds read-only, keeps history, and emits NO provider_switched", async () => {
  const disk = new Map<string, string[]>([["conv-flip", ["prior turn"]]]);
  const built: HistSession[] = [];
  setDefaultBackend(histBackend("pi", disk, built));
  registerBackend("anthropic", histBackend("anthropic", new Map(), []));

  const session = new HistSession(
    "pi",
    "execute",
    disk.get("conv-flip") as string[],
  );
  const conv = {
    session,
    queue: Promise.resolve(),
    provider: "openai-codex",
    model: "gpt-5-codex",
    backendId: "pi",
    mode: "execute",
  } as unknown as Conversation;
  modelState.model = OPENAI; // same provider/model — only the mode changes

  const events: WireEvent[] = [];
  const unsub = subscribe("conv-flip", (e) => events.push(e));
  await execTurn(
    conv,
    "conv-flip",
    "turn-plan",
    "draft me a plan",
    { author: undefined, priorAuthors: [] },
    { mode: "plan" },
  );
  unsub();

  expect(session.disposed).toBe(true);
  expect(conv.mode).toBe("plan");
  // Exactly one rebuild — the read-only session ran the turn on the prior history.
  expect(built).toHaveLength(1);
  expect(built[0].builtMode).toBe("plan");
  expect(built[0].prompts).toEqual(["prior turn", "draft me a plan"]);
  // A mode flip is internal (same provider/model): no divider frame.
  expect(events.some((e) => e.type === "provider_switched")).toBe(false);
});

test("a cross-backend switch that also flips mode lands on plan in a SINGLE rebuild", async () => {
  const piDisk = new Map<string, string[]>([["conv-x", ["pi turn"]]]);
  const claudeDisk = new Map<string, string[]>();
  const piBuilt: HistSession[] = [];
  const claudeBuilt: HistSession[] = [];
  setDefaultBackend(histBackend("pi", piDisk, piBuilt));
  registerBackend(
    "anthropic",
    histBackend("anthropic", claudeDisk, claudeBuilt),
  );

  const piSession = new HistSession(
    "pi",
    "execute",
    piDisk.get("conv-x") as string[],
  );
  const conv = {
    session: piSession,
    queue: Promise.resolve(),
    provider: "openai-codex",
    model: "gpt-5-codex",
    backendId: "pi",
    mode: "execute",
  } as unknown as Conversation;
  modelState.model = ANTHROPIC; // cross-backend AND plan

  const events: WireEvent[] = [];
  const unsub = subscribe("conv-x", (e) => events.push(e));
  await execTurn(
    conv,
    "conv-x",
    "turn-1",
    "plan across backends",
    { author: undefined, priorAuthors: [] },
    { mode: "plan" },
  );
  unsub();

  expect(piSession.disposed).toBe(true);
  expect(conv.backendId).toBe("anthropic");
  expect(conv.mode).toBe("plan");
  // ONE session built on the anthropic backend, already at plan (no double flip).
  expect(claudeBuilt).toHaveLength(1);
  expect(claudeBuilt[0].builtMode).toBe("plan");
  // The cross-backend boundary still draws its divider.
  expect(events.some((e) => e.type === "provider_switched")).toBe(true);
});
