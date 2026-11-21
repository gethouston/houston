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

process.env.HOUSTON_DATA_DIR = mkdtempSync(
  join(tmpdir(), "houston-evict-data-"),
);
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-evict-ws-"),
);
process.env.HOUSTON_SESSION_CACHE_MAX = "1";
process.env.HOUSTON_SESSION_CACHE_IDLE_MS = "0";

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
  async compact(): Promise<undefined> {}
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
  expect(session1.prompts).toContain("prior turn");

  await getConversation("c2");
  expect(session1.disposed).toBe(true);
  expect(conversations.has("c1")).toBe(false);
  expect(conversations.size).toBe(1);

  const conv1b = await getConversation("c1");
  expect(conv1b.session).not.toBe(session1);
  expect((conv1b.session as DiskSession).prompts).toContain("prior turn");
  expect(built).toHaveLength(3);
});

test("a session with an in-flight turn is never evicted from under it", async () => {
  modelState.model = OPENAI;
  const disk = new Map<string, string[]>();
  const built: DiskSession[] = [];
  setDefaultBackend(diskBackend(disk, built));

  const conv1 = await getConversation("c1");
  const session1 = conv1.session as DiskSession;
  (conv1 as Conversation).pending = 1;
  conv1.turnId = "turn-1";

  await getConversation("c2");
  await getConversation("c3");

  expect(session1.disposed).toBe(false);
  expect(conversations.has("c1")).toBe(true);
});
