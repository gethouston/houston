import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  createSdkMcpServer,
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { WireEvent } from "@houston/runtime-client";
import { describe, expect, test } from "vitest";
import { writeAuthFile } from "../auth/auth-file";
import { createTurnBackend } from "../turn/turn-backend";
import type { ClaudeQuery } from "./claude/session";
import type {
  CreateSessionOptions,
  HarnessBackend,
  HarnessSession,
} from "./types";

class FakeSession implements HarnessSession {
  private listeners = new Set<(event: WireEvent) => void>();
  private disposed = false;

  constructor(private readonly script: readonly WireEvent[]) {}

  subscribe(listener: (event: WireEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  async prompt(): Promise<void> {
    for (const event of this.script) {
      await Promise.resolve();
      for (const listener of this.listeners) listener(event);
    }
  }
  async abort(): Promise<void> {}
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.clear();
  }
  async setModel(): Promise<void> {}
  async compact(): Promise<void> {}
  setThinkingLevel(): void {}
  getContextUsage(): { tokens: number | null } | undefined {
    return undefined;
  }
}

const FAKE_EVENTS: readonly WireEvent[] = [
  { type: "text", data: "one " },
  { type: "text", data: "two" },
  {
    type: "usage",
    data: { context_tokens: 10, output_tokens: 2, cached_tokens: 0 },
  },
  { type: "done", data: null },
];

function fakeBackend(): HarnessBackend {
  return {
    id: "fake",
    async createSession(): Promise<HarnessSession> {
      return new FakeSession(FAKE_EVENTS);
    },
  };
}

const CLAUDE_MESSAGES: SDKMessage[] = [
  {
    type: "stream_event",
    event: {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "one " },
    },
    session_id: "s1",
    parent_tool_use_id: null,
  } as unknown as SDKMessage,
  {
    type: "stream_event",
    event: {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "two" },
    },
    session_id: "s1",
    parent_tool_use_id: null,
  } as unknown as SDKMessage,
  {
    type: "result",
    subtype: "success",
    usage: { input_tokens: 10, output_tokens: 2 },
    session_id: "s1",
  } as unknown as SDKMessage,
];

const CLAUDE_EVENTS: readonly WireEvent[] = [
  { type: "text", data: "one " },
  { type: "text", data: "two" },
  {
    type: "usage",
    data: { context_tokens: 10, output_tokens: 2, cached_tokens: 0 },
  },
];

async function openClaudeSession(): Promise<HarnessSession> {
  const turnRoot = mkdtempSync(join(tmpdir(), "claude-contract-"));
  const workspaceDir = join(turnRoot, "store", "workspace");
  const dataDir = join(turnRoot, "store", "data");
  mkdirSync(workspaceDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  writeAuthFile(join(dataDir, "auth.json"), {
    anthropic: {
      type: "oauth",
      access: "sk-ant-oat01-contract",
      refresh: "",
      expires: Date.now() + 60_000,
    },
  });
  const query: ClaudeQuery = async function* () {
    for (const message of CLAUDE_MESSAGES) {
      await Promise.resolve();
      yield message;
    }
  };
  const createMcp = ((input: { name: string }) => ({
    type: "sdk",
    name: input.name,
    instance: {},
  })) as typeof createSdkMcpServer;
  const backend = createTurnBackend("anthropic", {
    directories: { workspaceDir, dataDir, turnRoot },
    turn: {
      conversationId: "c1",
      text: "go",
      provider: "anthropic",
      emit: () => undefined,
      signal: undefined,
      turnId: "t1",
    },
    modelRuntime: {} as ModelRuntime,
    toolSelection: { toolNames: [], includeRunCode: false },
    codeSandbox: null,
    systemPrompt: "system",
    claudeSdk: { query, createSdkMcpServer: createMcp },
  });
  return backend.createSession({
    conversationId: "c1",
    model: {
      provider: "anthropic",
      id: "claude-sonnet-4-6",
      contextWindow: 200_000,
    },
  });
}

function backendContract(input: {
  name: string;
  open: () => Promise<HarnessSession>;
  expected: readonly WireEvent[];
}): void {
  describe(input.name, () => {
    test("events are delivered to the subscriber in order", async () => {
      const session = await input.open();
      const seen: WireEvent[] = [];
      session.subscribe((event) => seen.push(event));
      await session.prompt("go");
      expect(seen).toEqual(input.expected);
    });

    test("unsubscribe stops delivery", async () => {
      const session = await input.open();
      const seen: WireEvent[] = [];
      const unsubscribe = session.subscribe((event) => seen.push(event));
      unsubscribe();
      await session.prompt("go");
      expect(seen).toEqual([]);
    });

    test("prompt resolves only after the whole stream is delivered", async () => {
      const session = await input.open();
      const seen: WireEvent[] = [];
      session.subscribe((event) => seen.push(event));
      await session.prompt("go");
      expect(seen).toEqual(input.expected);
    });

    test("abort before any prompt is safe", async () => {
      const session = await input.open();
      await expect(session.abort()).resolves.toBeUndefined();
    });

    test("dispose is idempotent", async () => {
      const session = await input.open();
      expect(() => {
        session.dispose();
        session.dispose();
      }).not.toThrow();
    });
  });
}

backendContract({
  name: "scripted backend contract",
  open: () =>
    fakeBackend().createSession({
      conversationId: "c1",
      model: { provider: "fake", id: "m1", contextWindow: 1_000 },
    } satisfies CreateSessionOptions),
  expected: FAKE_EVENTS,
});

backendContract({
  name: "turn-mode Claude backend contract",
  open: openClaudeSession,
  expected: CLAUDE_EVENTS,
});
