import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  createSdkMcpServer,
  Options,
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { beforeEach, expect, test, vi } from "vitest";
import { writeAuthFile } from "../auth/auth-file";
import type { ClaudeQuery } from "../backends/claude/session";
import type {
  CreateSessionOptions,
  HarnessBackend,
  HarnessSession,
} from "../backends/types";
import {
  appendAssistantMessageAt,
  appendUserMessageAt,
} from "../store/conversation-file";
import {
  createTurnBackend,
  type TurnBackendDeps,
  turnClaudeLayout,
} from "./turn-backend";
import { runTurn, type TurnDirectories } from "./turn-session";

vi.mock("./turn-runtime", () => ({
  createTurnModelRuntime: async () => ({
    modelRuntime: {},
    model: {
      provider: "anthropic",
      id: "claude-sonnet-4-6",
      contextWindow: 200_000,
      reasoning: true,
    },
  }),
}));

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

async function directories(): Promise<TurnDirectories> {
  const turnRoot = await mkdtemp(join(tmpdir(), "claude-turn-session-"));
  const workspaceDir = join(turnRoot, "store", "workspace");
  const dataDir = join(turnRoot, "store", "data");
  await Promise.all([
    mkdir(workspaceDir, { recursive: true }),
    mkdir(dataDir, { recursive: true }),
  ]);
  writeAuthFile(join(dataDir, "auth.json"), {
    anthropic: {
      type: "oauth",
      access: "sk-ant-oat01-test",
      refresh: "",
      expires: Date.now() + 60_000,
    },
  });
  return { turnRoot, workspaceDir, dataDir };
}

function sdk(query: ClaudeQuery) {
  const makeMcp = ((input: { name: string }) => ({
    type: "sdk",
    name: input.name,
    instance: {},
  })) as typeof createSdkMcpServer;
  return { query, createSdkMcpServer: makeMcp };
}

function scriptedQuery(capture: (prompt: string, options: Options) => void) {
  const query: ClaudeQuery = async function* ({ prompt, options }) {
    capture(prompt, options);
    yield {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "reply" },
      },
      session_id: "session-next",
      parent_tool_use_id: null,
    } as unknown as SDKMessage;
    yield {
      type: "result",
      subtype: "success",
      usage: { input_tokens: 10, output_tokens: 2 },
      session_id: "session-next",
    } as unknown as SDKMessage;
  };
  return query;
}

function seedConversation(dataDir: string): void {
  const conversationsDir = join(dataDir, "conversations");
  appendUserMessageAt(conversationsDir, "c1", "Remember the blue lantern.", {
    turnId: "prior-user",
  });
  appendAssistantMessageAt(conversationsDir, "c1", "I will remember it.", {
    turnId: "prior-assistant",
  });
}

interface BackendCall {
  options: CreateSessionOptions;
  prompts: string[];
}

function recordingPiBackend(calls: BackendCall[]): HarnessBackend {
  return {
    id: "pi",
    async createSession(options) {
      const call: BackendCall = { options, prompts: [] };
      calls.push(call);
      return {
        subscribe: () => () => undefined,
        prompt: async (prompt) => {
          call.prompts.push(prompt);
        },
        abort: async () => undefined,
        dispose: () => undefined,
        setModel: async () => undefined,
        compact: async () => undefined,
        setThinkingLevel: () => undefined,
        getContextUsage: () => undefined,
      } satisfies HarnessSession;
    },
  };
}

function backendFactory(pi: HarnessBackend) {
  return (provider: string, input: TurnBackendDeps): HarnessBackend =>
    provider === "anthropic" ? createTurnBackend(provider, input) : pi;
}

async function writeClaudeTranscript(
  dirs: TurnDirectories,
  sessionId: string,
): Promise<void> {
  const layout = turnClaudeLayout(dirs.turnRoot, dirs.dataDir, "c1");
  const slug = dirs.workspaceDir.replace(/[^A-Za-z0-9]/g, "-");
  await mkdir(join(layout.configDir, "projects", slug), { recursive: true });
  await writeFile(
    join(layout.configDir, "projects", slug, `${sessionId}.jsonl`),
    "{}\n",
  );
}

async function runProviderTurn(
  dirs: TurnDirectories,
  provider: string,
  turnNumber: number,
  claude: ReturnType<typeof sdk>,
  pi: HarnessBackend,
): Promise<void> {
  await runTurn(
    dirs,
    {
      conversationId: "c1",
      text: `message ${turnNumber}`,
      provider,
      emit: () => undefined,
      signal: undefined,
      turnId: `turn-${turnNumber}`,
    },
    { claudeSdk: claude, createBackend: backendFactory(pi) },
  );
}

test("relocates a hydrated foreign-slug transcript and resumes without replay", async () => {
  const dirs = await directories();
  const layout = turnClaudeLayout(dirs.turnRoot, dirs.dataDir, "c1");
  seedConversation(dirs.dataDir);
  await mkdir(join(layout.configDir, "projects", "foreign-slug"), {
    recursive: true,
  });
  await writeFile(
    join(layout.configDir, "projects", "foreign-slug", "session-old.jsonl"),
    "{}\n",
  );
  await writeFile(layout.sessionsFile, JSON.stringify({ c1: "session-old" }));
  let captured: { prompt: string; options: Options } | undefined;

  await runTurn(
    dirs,
    {
      conversationId: "c1",
      text: "What did I ask you to remember?",
      provider: "anthropic",
      emit: () => undefined,
      signal: undefined,
      turnId: "current",
    },
    {
      claudeSdk: sdk(
        scriptedQuery((prompt, options) => {
          captured = { prompt, options };
        }),
      ),
    },
  );

  expect(captured?.options.resume).toBe("session-old");
  expect(captured?.prompt).not.toContain(
    "[Continuing an existing conversation.",
  );
  const slug = dirs.workspaceDir.replace(/[^A-Za-z0-9]/g, "-");
  await expect(
    stat(join(layout.configDir, "projects", slug, "session-old.jsonl")),
  ).resolves.toBeDefined();
});

test("a missing transcript starts fresh with the canonical replay preamble", async () => {
  const dirs = await directories();
  const layout = turnClaudeLayout(dirs.turnRoot, dirs.dataDir, "c1");
  seedConversation(dirs.dataDir);
  await mkdir(layout.configDir, { recursive: true });
  await writeFile(layout.sessionsFile, JSON.stringify({ c1: "missing" }));
  let captured: { prompt: string; options: Options } | undefined;

  await runTurn(
    dirs,
    {
      conversationId: "c1",
      text: "What did I ask you to remember?",
      provider: "anthropic",
      emit: () => undefined,
      signal: undefined,
      turnId: "current",
    },
    {
      claudeSdk: sdk(
        scriptedQuery((prompt, options) => {
          captured = { prompt, options };
        }),
      ),
    },
  );

  expect(captured?.options.resume).toBeUndefined();
  expect(captured?.prompt).toContain("[Continuing an existing conversation.");
  expect(captured?.prompt).toContain("User: Remember the blue lantern.");
  expect(captured?.prompt).toContain("Assistant: I will remember it.");
  expect(captured?.prompt).toContain("What did I ask you to remember?");
});

test("a pooled dangling-resume retry replays the canonical conversation", async () => {
  const dirs = await directories();
  const layout = turnClaudeLayout(dirs.turnRoot, dirs.dataDir, "c1");
  seedConversation(dirs.dataDir);
  await mkdir(join(layout.configDir, "projects", "foreign-slug"), {
    recursive: true,
  });
  await writeFile(
    join(layout.configDir, "projects", "foreign-slug", "session-old.jsonl"),
    "{}\n",
  );
  await writeFile(layout.sessionsFile, JSON.stringify({ c1: "session-old" }));
  const prompts: string[] = [];
  let attempt = 0;
  const query: ClaudeQuery = async function* ({ prompt }) {
    prompts.push(prompt);
    attempt++;
    if (attempt === 1)
      throw new Error("No conversation found with session ID: session-old");
    yield {
      type: "result",
      subtype: "success",
      usage: { input_tokens: 10, output_tokens: 2 },
      session_id: "session-next",
    } as unknown as SDKMessage;
  };

  await runTurn(
    dirs,
    {
      conversationId: "c1",
      text: "What did I ask you to remember?",
      provider: "anthropic",
      emit: () => undefined,
      signal: undefined,
      turnId: "current",
    },
    { claudeSdk: sdk(query) },
  );

  expect(prompts[0]).not.toContain("[Continuing an existing conversation.");
  expect(prompts[1]).toContain("[Continuing an existing conversation.");
  expect(prompts[1]).toContain("User: Remember the blue lantern.");
  expect(prompts[1]).toContain("What did I ask you to remember?");
});

test("anthropic to pi to anthropic flips fresh with replay while unchanged Claude resumes", async () => {
  const dirs = await directories();
  const claudeCalls: Array<{ prompt: string; options: Options }> = [];
  const claude = sdk(
    scriptedQuery((prompt, options) => {
      claudeCalls.push({ prompt, options });
    }),
  );
  const piCalls: BackendCall[] = [];
  const pi = recordingPiBackend(piCalls);

  await runProviderTurn(dirs, "anthropic", 1, claude, pi);
  await writeClaudeTranscript(dirs, "session-next");
  await runProviderTurn(dirs, "anthropic", 2, claude, pi);
  await runProviderTurn(dirs, "openai-codex", 3, claude, pi);
  await runProviderTurn(dirs, "anthropic", 4, claude, pi);

  expect(claudeCalls[1]?.options.resume).toBe("session-next");
  expect(claudeCalls[1]?.prompt).not.toContain(
    "[Continuing an existing conversation.",
  );
  expect(piCalls[0]?.options.fresh).toBe(true);
  expect(piCalls[0]?.prompts[0]).toContain(
    "[Continuing an existing conversation.",
  );
  expect(claudeCalls[2]?.options.resume).toBeUndefined();
  expect(claudeCalls[2]?.prompt).toContain(
    "[Continuing an existing conversation.",
  );
});

test("pi to anthropic to pi flips fresh with replay while unchanged pi resumes", async () => {
  const dirs = await directories();
  const claudeCalls: Array<{ prompt: string; options: Options }> = [];
  const claude = sdk(
    scriptedQuery((prompt, options) => {
      claudeCalls.push({ prompt, options });
    }),
  );
  const piCalls: BackendCall[] = [];
  const pi = recordingPiBackend(piCalls);

  await runProviderTurn(dirs, "openai-codex", 1, claude, pi);
  await runProviderTurn(dirs, "openai-codex", 2, claude, pi);
  await runProviderTurn(dirs, "anthropic", 3, claude, pi);
  await runProviderTurn(dirs, "openai-codex", 4, claude, pi);

  expect(piCalls[0]?.options.fresh).toBeUndefined();
  expect(piCalls[1]?.options.fresh).toBeUndefined();
  expect(piCalls[1]?.prompts[0]).not.toContain(
    "[Continuing an existing conversation.",
  );
  expect(claudeCalls[0]?.options.resume).toBeUndefined();
  expect(claudeCalls[0]?.prompt).toContain(
    "[Continuing an existing conversation.",
  );
  expect(piCalls[2]?.options.fresh).toBe(true);
  expect(piCalls[2]?.prompts[0]).toContain(
    "[Continuing an existing conversation.",
  );
});

test("a corrupt harness marker degrades to unknown instead of failing the turn", async () => {
  const { readTurnHarness, turnHarnessFile, writeTurnHarness } = await import(
    "./turn-harness-state"
  );
  const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { dirname, join } = await import("node:path");
  const dataDir = mkdtempSync(join(tmpdir(), "harness-marker-"));
  const file = turnHarnessFile(dataDir, "c1");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, "{not json");
  expect(readTurnHarness(dataDir, "c1")).toBeUndefined();
  writeFileSync(file, JSON.stringify({ backend: "spacex" }));
  expect(readTurnHarness(dataDir, "c1")).toBeUndefined();
  writeTurnHarness(dataDir, "c1", "claude");
  expect(readTurnHarness(dataDir, "c1")).toBe("claude");
});
