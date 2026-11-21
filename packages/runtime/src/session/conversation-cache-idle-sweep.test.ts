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
  join(tmpdir(), "houston-sweep-data-"),
);
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-sweep-ws-"),
);
process.env.HOUSTON_SESSION_CACHE_MAX = "40";
process.env.HOUSTON_SESSION_CACHE_IDLE_MS = "40";

const modelState = vi.hoisted(() => ({ model: null as ResolvedModel | null }));
vi.mock("../ai/providers", async (importOriginal) => {
  const real = await importOriginal<typeof import("../ai/providers")>();
  return {
    ...real,
    resolveModel: () => modelState.model,
    activeEffort: () => null,
  };
});

const { getConversation, conversations } = await import("./conversation-cache");
const { setDefaultBackend } = await import("../backends/registry");

const OPENAI: ResolvedModel = {
  provider: "openai-codex",
  id: "gpt-5-codex",
  contextWindow: 400_000,
};

class IdleSession implements HarnessSession {
  disposed = false;
  subscribe(_l: (e: WireEvent) => void): () => void {
    return () => {};
  }
  async prompt(): Promise<void> {}
  async abort(): Promise<void> {}
  dispose(): void {
    this.disposed = true;
  }
  async setModel(): Promise<void> {}
  async compact(): Promise<undefined> {}
  setThinkingLevel(): void {}
  getContextUsage(): { tokens: number | null } {
    return { tokens: 0 };
  }
}

const backend: HarnessBackend = {
  id: "pi",
  async createSession(_opts: CreateSessionOptions): Promise<HarnessSession> {
    return new IdleSession();
  },
};

const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterEach(() => {
  modelState.model = null;
  conversations.clear();
});

test("a settled session past the idle TTL is disposed with no further access", async () => {
  modelState.model = OPENAI;
  setDefaultBackend(backend);

  const conv = await getConversation("quiet");
  const session = conv.session as IdleSession;
  expect(conversations.has("quiet")).toBe(true);

  await settle(200);
  expect(session.disposed).toBe(true);
  expect(conversations.has("quiet")).toBe(false);
});

test("a session with an in-flight turn survives the clock sweep", async () => {
  modelState.model = OPENAI;
  setDefaultBackend(backend);

  const conv = await getConversation("busy");
  conv.pending = 1;
  await settle(200);
  expect((conv.session as IdleSession).disposed).toBe(false);
  expect(conversations.has("busy")).toBe(true);
  conv.pending = 0;
});
