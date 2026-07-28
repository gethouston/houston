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
 * COMPLIANCE GATE — mid-conversation switch across a BACKEND boundary.
 *
 * The `anthropic` provider runs turns through the Claude Agent SDK subprocess, NOT
 * pi's in-process Anthropic client (which would hit api.anthropic.com with a setup
 * token + Claude Code headers — the harness-spoofing request Anthropic blocks).
 * A conversation that starts on pi (openai/google) and switches to Claude
 * mid-conversation MUST rebuild its session on the Claude backend — a `setModel`
 * that forwards an anthropic model into the still-live pi session is the exact leak
 * this feature exists to prevent. The reverse (anthropic→openai) must rebuild on
 * pi, never `setModel` an openai id through the Claude subprocess.
 */

// Point config at throwaway dirs BEFORE the module graph loads (config reads these
// at import; conversation-cache wires the real backends at module load).
process.env.HOUSTON_DATA_DIR = mkdtempSync(
  join(tmpdir(), "houston-bswitch-data-"),
);
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-bswitch-ws-"),
);

// The model THIS turn resolves to is script-controlled: the repro drives a turn
// whose resolved model belongs to a DIFFERENT backend than the live session.
const modelState = vi.hoisted(() => ({ model: null as ResolvedModel | null }));
vi.mock("../ai/providers", async (importOriginal) => {
  const real = await importOriginal<typeof import("../ai/providers")>();
  return {
    ...real,
    resolveModel: () => modelState.model,
    activeEffort: () => null,
  };
});

// Import AFTER the mocks + env so module-load backend registration uses the temp
// dirs and the mocked resolveModel.
await import("./conversation-cache");
const { execTurn } = await import("./exec-turn");
const { registerBackend, setDefaultBackend } = await import(
  "../backends/registry"
);
const { subscribe } = await import("./bus");
const { appendAssistantMessage, appendUserMessage } = await import(
  "../store/conversations"
);
type Conversation = import("./conversation-cache").Conversation;

/** A session that records every prompt/setModel/dispose so the test can assert the
 *  live session is torn down (not driven) across a backend boundary. */
class SpySession implements HarnessSession {
  prompts: string[] = [];
  setModels: ResolvedModel[] = [];
  compacts = 0;
  disposed = false;
  private listeners = new Set<(e: WireEvent) => void>();
  constructor(readonly backendId: string) {}
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
  async setModel(m: ResolvedModel): Promise<void> {
    this.setModels.push(m);
  }
  async compact(): Promise<void> {
    this.compacts++;
  }
  setThinkingLevel(): void {}
  getContextUsage(): { tokens: number | null } {
    return { tokens: 100 };
  }
}

function spyBackend(
  id: string,
  created: SpySession[],
  opts?: CreateSessionOptions[],
): HarnessBackend {
  return {
    id,
    async createSession(o: CreateSessionOptions): Promise<HarnessSession> {
      opts?.push(o);
      const s = new SpySession(id);
      created.push(s);
      return s;
    },
  };
}

function convWith(session: SpySession, provider: string, model: string) {
  return {
    session,
    queue: Promise.resolve(),
    provider,
    model,
    backendId: session.backendId,
    mode: "execute",
  } as unknown as Conversation;
}

afterEach(() => {
  modelState.model = null;
});

const ANTHROPIC: ResolvedModel = {
  provider: "anthropic",
  id: "claude-sonnet-4-5",
  contextWindow: 200_000,
};
const OPENAI: ResolvedModel = {
  provider: "openai-codex",
  id: "gpt-5-codex",
  contextWindow: 400_000,
};

test("openai→anthropic REBUILDS on the anthropic backend — the pi session is disposed, never prompted or setModel'd", async () => {
  const piCreated: SpySession[] = [];
  const claudeCreated: SpySession[] = [];
  setDefaultBackend(spyBackend("pi", piCreated));
  registerBackend("anthropic", spyBackend("anthropic", claudeCreated));

  const piSession = new SpySession("pi");
  const conv = convWith(piSession, "openai-codex", "gpt-5-codex");
  modelState.model = ANTHROPIC;

  const events: WireEvent[] = [];
  const unsub = subscribe("conv-a", (e) => events.push(e));
  await execTurn(conv, "conv-a", "turn-1", "hello", {
    author: undefined,
    priorAuthors: [],
  });
  unsub();

  // The compliance gate: the live pi session must NOT touch this anthropic turn.
  expect(piSession.prompts).toEqual([]);
  expect(piSession.setModels).toEqual([]);
  expect(piSession.disposed).toBe(true);
  // A fresh session on the ANTHROPIC (Claude SDK) backend ran the turn.
  expect(claudeCreated).toHaveLength(1);
  expect(claudeCreated[0].prompts).toEqual(["hello"]);
  expect(conv.session).toBe(claudeCreated[0]);
  expect((conv as unknown as { backendId: string }).backendId).toBe(
    "anthropic",
  );
  expect(conv.provider).toBe("anthropic");
  // The boundary is still announced so the chat draws its divider.
  expect(events.some((e) => e.type === "provider_switched")).toBe(true);
});

test("anthropic→openai REBUILDS on the pi backend — the Claude session is disposed, never prompted or setModel'd", async () => {
  const piCreated: SpySession[] = [];
  const claudeCreated: SpySession[] = [];
  setDefaultBackend(spyBackend("pi", piCreated));
  registerBackend("anthropic", spyBackend("anthropic", claudeCreated));

  const claudeSession = new SpySession("anthropic");
  const conv = convWith(claudeSession, "anthropic", "claude-sonnet-4-5");
  modelState.model = OPENAI;

  const events: WireEvent[] = [];
  const unsub = subscribe("conv-b", (e) => events.push(e));
  await execTurn(conv, "conv-b", "turn-1", "hello", {
    author: undefined,
    priorAuthors: [],
  });
  unsub();

  expect(claudeSession.prompts).toEqual([]);
  expect(claudeSession.setModels).toEqual([]);
  expect(claudeSession.disposed).toBe(true);
  expect(piCreated).toHaveLength(1);
  expect(piCreated[0].prompts).toEqual(["hello"]);
  expect(conv.session).toBe(piCreated[0]);
  expect((conv as unknown as { backendId: string }).backendId).toBe("pi");
  expect(conv.provider).toBe("openai-codex");
  expect(events.some((e) => e.type === "provider_switched")).toBe(true);
});

test("cross-backend rebuild carries the conversation over: fresh session + transcript replay on the first prompt (HOU-951)", async () => {
  const piCreated: SpySession[] = [];
  const claudeCreated: SpySession[] = [];
  const claudeOpts: CreateSessionOptions[] = [];
  setDefaultBackend(spyBackend("pi", piCreated));
  registerBackend(
    "anthropic",
    spyBackend("anthropic", claudeCreated, claudeOpts),
  );

  // The conversation so far (ran on pi/gemini), plus THIS turn's already-recorded
  // user message — exactly what the store holds when execTurn runs.
  appendUserMessage("conv-replay", "my name is Zoe", { turnId: "turn-0" });
  appendAssistantMessage("conv-replay", "Nice to meet you, Zoe!", {
    turnId: "turn-0",
  });
  appendUserMessage("conv-replay", "what is my name?", { turnId: "turn-1" });

  const piSession = new SpySession("pi");
  const conv = convWith(piSession, "google", "gemini-2.5-pro");
  modelState.model = ANTHROPIC;

  await execTurn(conv, "conv-replay", "turn-1", "what is my name?", {
    author: undefined,
    priorAuthors: [],
  });

  // The new backend must start FRESH (never resume its stale pre-switch store).
  expect(claudeOpts).toHaveLength(1);
  expect(claudeOpts[0].fresh).toBe(true);
  // The first prompt replays the prior turns so the model keeps the context…
  const prompt = claudeCreated[0].prompts[0];
  expect(prompt).toContain("User: my name is Zoe");
  expect(prompt).toContain("Assistant: Nice to meet you, Zoe!");
  // …excludes THIS turn's message from the replay (it IS the prompt's tail)…
  expect(prompt.endsWith("what is my name?")).toBe(true);
  expect(prompt.match(/what is my name\?/g)).toHaveLength(1);
  // …and the user's stored message stays the plain text (no preamble in the bubble).
  expect(prompt).not.toBe("what is my name?");
});

test("same-backend model change (openai→google, both pi) stays on the setModel fast path — no rebuild", async () => {
  const piCreated: SpySession[] = [];
  setDefaultBackend(spyBackend("pi", piCreated));
  registerBackend("anthropic", spyBackend("anthropic", []));

  const piSession = new SpySession("pi");
  const conv = convWith(piSession, "openai-codex", "gpt-5-codex");
  modelState.model = {
    provider: "google",
    id: "gemini-2.5-pro",
    contextWindow: 1_000_000,
  };

  await execTurn(conv, "conv-c", "turn-1", "hello", {
    author: undefined,
    priorAuthors: [],
  });

  // No teardown: the live session is kept and re-pointed via setModel.
  expect(piSession.disposed).toBe(false);
  expect(piCreated).toHaveLength(0); // no new session was built
  expect(piSession.setModels.map((m) => m.id)).toEqual(["gemini-2.5-pro"]);
  expect(piSession.prompts).toEqual(["hello"]);
  expect(conv.session).toBe(piSession);
  expect((conv as unknown as { backendId: string }).backendId).toBe("pi");
});
