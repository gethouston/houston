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
 * The live-session cache is LRU-bounded so a long-lived runtime's memory tracks
 * its ACTIVE conversations, not every one ever opened. Under test: an idle
 * session past the bound is disposed and TRANSPARENTLY re-hydrated from its
 * on-disk transcript on next access (behavior-preserving), and a session with a
 * queued/executing turn is NEVER evicted from under it.
 *
 * The bound is pinned to 1 (and idle TTL disabled) via env BEFORE the module
 * graph loads — config reads env at import, and conversation-cache builds the
 * bounded cache at module load.
 */

process.env.HOUSTON_DATA_DIR = mkdtempSync(
  join(tmpdir(), "houston-evict-data-"),
);
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-evict-ws-"),
);
process.env.HOUSTON_SESSION_CACHE_MAX = "1";
process.env.HOUSTON_SESSION_CACHE_IDLE_MS = "0"; // size bound only, deterministic

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
const { getConversation, conversations } = await import("./conversation-cache");
const { setDefaultBackend } = await import("../backends/registry");
type Conversation = import("./conversation-cache").Conversation;

const OPENAI: ResolvedModel = {
  provider: "openai-codex",
  id: "gpt-5-codex",
  contextWindow: 400_000,
};

/**
 * A session over a shared per-conversation "disk" (its `prompts` array): a
 * session rebuilt for the same id re-attaches to the SAME transcript, modeling
 * on-disk rehydration (pi's continueRecent / the Claude store). Records dispose.
 */
class DiskSession implements HarnessSession {
  disposed = false;
  private listeners = new Set<(e: WireEvent) => void>();
  constructor(readonly prompts: string[]) {}
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

function diskBackend(
  disk: Map<string, string[]>,
  built: DiskSession[],
): HarnessBackend {
  return {
    id: "pi",
    async createSession(opts: CreateSessionOptions): Promise<HarnessSession> {
      const transcript = disk.get(opts.conversationId) ?? [];
      disk.set(opts.conversationId, transcript);
      const s = new DiskSession(transcript);
      built.push(s);
      return s;
    },
  };
}

afterEach(() => {
  modelState.model = null;
  conversations.clear();
});

test("an idle session past the bound is disposed and re-hydrated from disk on next access", async () => {
  modelState.model = OPENAI;
  const disk = new Map<string, string[]>([["c1", ["prior turn"]]]);
  const built: DiskSession[] = [];
  setDefaultBackend(diskBackend(disk, built));

  const conv1 = await getConversation("c1");
  const session1 = conv1.session as DiskSession;
  expect(session1.prompts).toContain("prior turn"); // rehydrated at first build

  // Opening a second conversation with cap=1 evicts idle c1 — its session is
  // disposed to release memory (the on-disk transcript is untouched).
  await getConversation("c2");
  expect(session1.disposed).toBe(true);
  expect(conversations.has("c1")).toBe(false);
  expect(conversations.size).toBe(1);

  // Re-opening c1 transparently rebuilds a session re-attached to the SAME
  // on-disk transcript — behavior is preserved, nothing is lost.
  const conv1b = await getConversation("c1");
  expect(conv1b.session).not.toBe(session1);
  expect((conv1b.session as DiskSession).prompts).toContain("prior turn");
  expect(built).toHaveLength(3); // c1, c2, c1-rebuilt
});

test("a session with an in-flight turn is never evicted from under it", async () => {
  modelState.model = OPENAI;
  const disk = new Map<string, string[]>();
  const built: DiskSession[] = [];
  setDefaultBackend(diskBackend(disk, built));

  const conv1 = await getConversation("c1");
  const session1 = conv1.session as DiskSession;
  // Simulate a turn queued-and-running: chat.ts pins the session this way for a
  // turn's whole lifetime (turnId while executing, pending while queued).
  (conv1 as Conversation).pending = 1;
  conv1.turnId = "turn-1";

  // Several more conversations, each of which would evict the LRU tail (c1) —
  // but c1 is busy, so it is retained past the size bound instead of dropped.
  await getConversation("c2");
  await getConversation("c3");

  expect(session1.disposed).toBe(false);
  expect(conversations.has("c1")).toBe(true);
});
