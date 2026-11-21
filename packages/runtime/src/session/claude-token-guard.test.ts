import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WireEvent } from "@houston/runtime-client";
import { afterEach, expect, test, vi } from "vitest";
import type { HarnessSession, ResolvedModel } from "../backends/types";

process.env.HOUSTON_DATA_DIR = mkdtempSync(
  join(tmpdir(), "houston-token-guard-data-"),
);
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-token-guard-ws-"),
);

const state = vi.hoisted(() => ({
  model: null as ResolvedModel | null,
  token: undefined as { accessDigest?: string } | undefined,
}));
vi.mock("../ai/providers", async (importOriginal) => {
  const real = await importOriginal<typeof import("../ai/providers")>();
  return {
    ...real,
    resolveModel: () => state.model,
    activeEffort: () => null,
  };
});
vi.mock("../backends/claude/read-token", () => ({
  readAnthropicToken: () => state.token,
}));

await import("./conversation-cache");
const { conversations, getConversation } = await import("./conversation-cache");
const { evictClaudeSessionOnRevokedToken } = await import(
  "./claude-token-guard"
);
const { execTurn } = await import("./exec-turn");
const { registerBackend, setDefaultBackend } = await import(
  "../backends/registry"
);
type Conversation = import("./conversation-cache").Conversation;

const CLAUDE: ResolvedModel = {
  provider: "anthropic",
  id: "claude-sonnet-4-6",
  contextWindow: 200_000,
};
const OPENAI: ResolvedModel = {
  provider: "openai-codex",
  id: "gpt-5-codex",
  contextWindow: 400_000,
};

class FakeClaudeSession implements HarnessSession {
  disposed = false;
  script: WireEvent[] = [];
  private readonly digest = state.token?.accessDigest;
  private listeners = new Set<(e: WireEvent) => void>();
  subscribe(l: (e: WireEvent) => void): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
  async prompt(): Promise<void> {
    for (const e of this.script) for (const l of [...this.listeners]) l(e);
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
  getUsedAccessDigest(): string | undefined {
    return this.digest;
  }
}

const builtSessions: FakeClaudeSession[] = [];
registerBackend("anthropic", {
  id: "anthropic",
  async createSession() {
    const s = new FakeClaudeSession();
    builtSessions.push(s);
    return s;
  },
});

class PiSession extends FakeClaudeSession {
  override getUsedAccessDigest(): string | undefined {
    return undefined;
  }
}
setDefaultBackend({
  id: "pi",
  async createSession() {
    return new PiSession();
  },
});

const revokedError: WireEvent = {
  type: "provider_error",
  data: {
    kind: "unauthenticated",
    provider: "anthropic",
    cause: "token_revoked",
    message: "OAuth token revoked",
  },
};

afterEach(() => {
  conversations.clear();
  builtSessions.length = 0;
  state.model = null;
  state.token = undefined;
});

test("a rotated token rebuilds the cached Claude session at the next lookup, on the new digest", async () => {
  state.model = CLAUDE;
  state.token = { accessDigest: "digest-a" };
  const conv1 = await getConversation("c1");
  const session1 = conv1.session as FakeClaudeSession;
  expect(session1.getUsedAccessDigest()).toBe("digest-a");

  state.token = { accessDigest: "digest-b" };
  const conv2 = await getConversation("c1");

  expect(conv2.session).not.toBe(session1);
  expect(session1.disposed).toBe(true);
  expect(conv2.session.getUsedAccessDigest?.()).toBe("digest-b");
});

test("a matching digest returns the SAME session — no spurious rebuild churn", async () => {
  state.model = CLAUDE;
  state.token = { accessDigest: "digest-a" };
  const conv1 = await getConversation("c1");
  const conv2 = await getConversation("c1");
  expect(conv2.session).toBe(conv1.session);
  expect((conv1.session as FakeClaudeSession).disposed).toBe(false);
  expect(builtSessions).toHaveLength(1);
});

test("a digest-less Claude session (api_key / config-dir credential) is never rebuilt", async () => {
  state.model = CLAUDE;
  state.token = {};
  const conv1 = await getConversation("c1");
  state.token = { accessDigest: "digest-new" };
  const conv2 = await getConversation("c1");
  expect(conv2.session).toBe(conv1.session);
});

test("a non-Claude backend is untouched by an anthropic rotation", async () => {
  state.model = OPENAI;
  state.token = { accessDigest: "digest-a" };
  const conv1 = await getConversation("c-pi");
  state.token = { accessDigest: "digest-b" };
  const conv2 = await getConversation("c-pi");
  expect(conv2.session).toBe(conv1.session);
});

test("a BUSY conversation is never rebuilt from under its queued turns", async () => {
  state.model = CLAUDE;
  state.token = { accessDigest: "digest-a" };
  const conv1 = await getConversation("c1");
  conv1.pending = 1;
  state.token = { accessDigest: "digest-b" };
  const conv2 = await getConversation("c1");
  expect(conv2.session).toBe(conv1.session);
  expect((conv1.session as FakeClaudeSession).disposed).toBe(false);
});

test("a token_revoked turn evicts the session; the next lookup builds fresh", async () => {
  state.model = CLAUDE;
  state.token = { accessDigest: "digest-a" };
  const conv = await getConversation("c1");
  (conv.session as FakeClaudeSession).script = [revokedError];

  await execTurn(conv, "c1", "turn-1", "hi", {
    author: undefined,
    priorAuthors: [],
  });

  expect(conversations.has("c1")).toBe(false);
  expect((conv.session as FakeClaudeSession).disposed).toBe(true);
  state.token = { accessDigest: "digest-after-reconnect" };
  const rebuilt = await getConversation("c1");
  expect(rebuilt.session).not.toBe(conv.session);
  expect(rebuilt.session.getUsedAccessDigest?.()).toBe(
    "digest-after-reconnect",
  );
});

test("a non-revoked failure leaves the session cached (only token_revoked evicts)", async () => {
  state.model = CLAUDE;
  state.token = { accessDigest: "digest-a" };
  const conv = await getConversation("c1");
  (conv.session as FakeClaudeSession).script = [
    {
      type: "provider_error",
      data: {
        kind: "rate_limited",
        provider: "anthropic",
        model: null,
        message: "429",
        retry_after_seconds: null,
      },
    },
  ];
  await execTurn(conv, "c1", "turn-1", "hi", {
    author: undefined,
    priorAuthors: [],
  });
  expect(conversations.has("c1")).toBe(true);
  expect((conv.session as FakeClaudeSession).disposed).toBe(false);
});

test("eviction defers while OTHER turns are queued, and ignores non-Claude backends", () => {
  const session = new FakeClaudeSession();
  const conv = {
    session,
    backendId: "anthropic",
    pending: 2,
  } as unknown as Conversation;
  const revoked = revokedError.data as Extract<
    WireEvent,
    { type: "provider_error" }
  >["data"];
  expect(
    evictClaudeSessionOnRevokedToken(conversations, "cx", conv, revoked),
  ).toBe(false);
  expect(session.disposed).toBe(false);

  conv.pending = 1;
  expect(
    evictClaudeSessionOnRevokedToken(conversations, "cx", conv, revoked),
  ).toBe(true);
  expect(session.disposed).toBe(true);

  const piConv = {
    session: new FakeClaudeSession(),
    backendId: "pi",
    pending: 1,
  } as unknown as Conversation;
  expect(
    evictClaudeSessionOnRevokedToken(conversations, "cy", piConv, revoked),
  ).toBe(false);
});
