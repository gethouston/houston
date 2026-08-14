import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WireEvent } from "@houston/runtime-client";
import { afterEach, expect, test, vi } from "vitest";
import type { HarnessSession, ResolvedModel } from "../backends/types";

/**
 * PRODUCT-1355: Claude sessions must follow the rotated Anthropic token.
 *
 * Layer 2 under test: a cached session whose pinned access-token digest no
 * longer matches the STORED credential is disposed and rebuilt at conversation
 * lookup, so the fresh session reads the current token. Matching digests,
 * digest-less sessions, non-Claude backends, and busy conversations are never
 * rebuilt (no churn, no disposal from under a queued turn).
 *
 * Layer 3 under test: a turn that ends on `unauthenticated`/`token_revoked`
 * evicts the conversation's in-memory session (history stays on disk), so the
 * next attempt after a reconnect rebuilds cleanly instead of retrying the
 * dead subprocess env forever.
 */

// Point config at throwaway dirs BEFORE the module graph loads (config reads
// env at import; conversation-cache wires backends at load).
process.env.HOUSTON_DATA_DIR = mkdtempSync(
  join(tmpdir(), "houston-token-guard-data-"),
);
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-token-guard-ws-"),
);

const state = vi.hoisted(() => ({
  model: null as ResolvedModel | null,
  /** What the (mocked) credential store currently holds for `anthropic`. */
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
// The guard's "what does the store hold NOW" read (also used by the real
// backend registration in conversation-cache, which these tests override).
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

/**
 * A stand-in for `ClaudeSession`: pins the digest the store held at BUILD time
 * (exactly what the real backend does) and replays a scripted turn on prompt.
 */
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
  async compact(): Promise<void> {}
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

/** A digest-less non-Claude session (pi never pins a token). */
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

  // The gateway rotates the family; the serve path stores the new token.
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
  state.token = {}; // api_key entry: read-token attaches no digest
  const conv1 = await getConversation("c1");
  // Even a later oauth connect must not tear down a session that pinned
  // nothing — it re-reads the credential per prompt anyway.
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
  conv1.pending = 1; // a turn is queued/running on this very object
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
  // The user reconnects (new token stored) → the next attempt rebuilds
  // cleanly on the fresh credential instead of retrying the dead session.
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
    pending: 2, // the settling turn + one still queued on this object
  } as unknown as Conversation;
  const revoked = revokedError.data as Extract<
    WireEvent,
    { type: "provider_error" }
  >["data"];
  expect(
    evictClaudeSessionOnRevokedToken(conversations, "cx", conv, revoked),
  ).toBe(false);
  expect(session.disposed).toBe(false);

  conv.pending = 1; // last turn settling → now it may evict
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
