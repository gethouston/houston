import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import type { WireFrame } from "@houston/runtime-client";
import { beforeEach, expect, test, vi } from "vitest";
import { writeAuthFile } from "../auth/auth-file";
import { simulatedClaudeApi } from "../backends/claude/simulated-api.test-support";
import type {
  CreateSessionOptions,
  HarnessBackend,
  HarnessSession,
  ResolvedModel,
} from "../backends/types";
import {
  appendAssistantMessageAt,
  appendUserMessageAt,
  loadConversation,
  saveConversation,
} from "../store/conversation-file";
import { turnClaudeLayout } from "./turn-backend";
import { writeTurnHarness } from "./turn-harness-state";
import { runTurn, type TurnDirectories } from "./turn-session";
import type { RunTurnDeps } from "./turn-session-startup";

/**
 * Houston's proactive autocompact on a POOLED turn: the standing server
 * compacts a conversation whose context is 93% full before prompting
 * (session/exec-turn.ts); a pooled turn must too, or a long chat on E2B runs
 * into its window and fails where the same chat on a pod kept going.
 */

const target = vi.hoisted(() => ({
  model: {
    provider: "google",
    id: "gemini-test",
    contextWindow: 100_000,
  } as ResolvedModel,
}));
vi.mock("./turn-runtime", () => ({
  createTurnModelRuntime: async () => ({
    modelRuntime: {},
    model: target.model,
  }),
}));

const ID = "c1";

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

async function directories(): Promise<TurnDirectories> {
  const turnRoot = await mkdtemp(join(tmpdir(), "turn-autocompact-"));
  const workspaceDir = join(turnRoot, "store", "workspace");
  const dataDir = join(turnRoot, "store", "data");
  await mkdir(workspaceDir, { recursive: true });
  await mkdir(dataDir, { recursive: true });
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

/** A chat whose last reply reported `contextTokens` of context fill. */
function seedChat(dataDir: string, contextTokens: number): void {
  const dir = join(dataDir, "conversations");
  appendUserMessageAt(dir, ID, "Remember the blue lantern.", {
    turnId: "prior",
  });
  appendAssistantMessageAt(dir, ID, "I will remember it.", {
    turnId: "prior",
    usage: {
      context_tokens: contextTokens,
      output_tokens: 40,
      cached_tokens: 0,
    },
  });
}

/** A pi session resumed at `fill` tokens that records what it was asked. */
function piBackend(fill: number, compact: HarnessSession["compact"]) {
  const created: CreateSessionOptions[] = [];
  const prompts: string[] = [];
  const backend: HarnessBackend = {
    id: "pi",
    async createSession(options) {
      created.push(options);
      return {
        subscribe: () => () => undefined,
        prompt: async (text) => {
          prompts.push(text);
        },
        abort: async () => undefined,
        dispose: () => undefined,
        setModel: async () => undefined,
        compact,
        setThinkingLevel: () => undefined,
        getContextUsage: () => ({ tokens: fill }),
      };
    },
  };
  return { backend, created, prompts };
}

async function send(
  dirs: TurnDirectories,
  turnId: string,
  deps: RunTurnDeps,
  frames: WireFrame[] = [],
) {
  return runTurn(
    dirs,
    {
      conversationId: ID,
      text: "What did I ask you to remember?",
      provider: target.model.provider,
      emit: (frame) => frames.push(frame),
      signal: undefined,
      turnId,
    },
    deps,
  );
}

const lastAssistant = (dataDir: string) =>
  loadConversation(join(dataDir, "conversations"), ID)
    ?.messages.filter((m) => m.role === "assistant")
    .at(-1);

test("a nearly full pi session compacts before the prompt, like the pod", async () => {
  target.model = {
    provider: "google",
    id: "gemini-test",
    contextWindow: 100_000,
  };
  const dirs = await directories();
  seedChat(dirs.dataDir, 95_000);
  const compact = vi.fn(async () => undefined);
  const pi = piBackend(95_000, compact);
  const frames: WireFrame[] = [];

  await send(dirs, "t1", { createBackend: () => pi.backend }, frames);

  expect(compact).toHaveBeenCalledTimes(1);
  expect(frames).toContainEqual(
    expect.objectContaining({
      type: "context_compacted",
      data: { trigger: "proactive", pre_tokens: 95_000 },
    }),
  );
  expect(lastAssistant(dirs.dataDir)?.compaction).toEqual({
    trigger: "proactive",
    pre_tokens: 95_000,
  });
});

test("a session under the threshold prompts without compacting", async () => {
  target.model = {
    provider: "google",
    id: "gemini-test",
    contextWindow: 100_000,
  };
  const dirs = await directories();
  seedChat(dirs.dataDir, 50_000);
  const compact = vi.fn(async () => undefined);

  await send(dirs, "t1", {
    createBackend: () => piBackend(50_000, compact).backend,
  });

  expect(compact).not.toHaveBeenCalled();
  expect(lastAssistant(dirs.dataDir)?.compaction).toBeUndefined();
});

test("a failed compaction holds the next pooled turns off for the cooldown", async () => {
  target.model = {
    provider: "google",
    id: "gemini-test",
    contextWindow: 100_000,
  };
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const dirs = await directories();
  seedChat(dirs.dataDir, 95_000);
  const compact = vi.fn(async () => {
    throw new Error("Summarization failed: the summarizer returned no summary");
  });

  // Two turns, two processes: nothing survives between them but the tree.
  await send(dirs, "t1", {
    createBackend: () => piBackend(95_000, compact).backend,
  });
  await send(dirs, "t2", {
    createBackend: () => piBackend(96_000, compact).backend,
  });

  // The first turn paid for one failed summarization; the second did not pay
  // for another, and both turns still ran.
  expect(compact).toHaveBeenCalledTimes(1);
  expect(lastAssistant(dirs.dataDir)?.turnId).toBe("t2");
});

function claudeSdk(api: ReturnType<typeof simulatedClaudeApi>) {
  const makeMcp = ((input: { name: string }) => ({
    type: "sdk",
    name: input.name,
    instance: {},
  })) as typeof createSdkMcpServer;
  return { query: api.query, createSdkMcpServer: makeMcp };
}

async function seedClaudeSession(
  dirs: TurnDirectories,
  api: ReturnType<typeof simulatedClaudeApi>,
  tokens: number,
) {
  const layout = turnClaudeLayout(dirs.turnRoot, dirs.dataDir, ID);
  const slugDir = join(
    layout.configDir,
    "projects",
    dirs.workspaceDir.replace(/[^A-Za-z0-9]/g, "-"),
  );
  await mkdir(slugDir, { recursive: true });
  await writeFile(join(slugDir, "sim-old.jsonl"), "{}\n");
  await writeFile(layout.sessionsFile, JSON.stringify({ [ID]: "sim-old" }));
  writeTurnHarness(dirs.dataDir, ID, "claude");
  api.seedSession("sim-old", tokens);
}

const claudeModel: ResolvedModel = {
  provider: "anthropic",
  id: "claude-opus-5",
  contextWindow: 200_000,
};

test("a fresh Claude process reads the fill from the transcript and compacts", async () => {
  target.model = claudeModel;
  const dirs = await directories();
  seedChat(dirs.dataDir, 190_000);
  const api = simulatedClaudeApi({
    windowTokens: 200_000,
    systemTokens: 1_000,
    runGrowthTokens: 0,
  });
  await seedClaudeSession(dirs, api, 185_000);
  const frames: WireFrame[] = [];

  await send(dirs, "t1", { claudeSdk: claudeSdk(api) }, frames);

  // The summarization resumed the full session; the turn then opened a new
  // session carrying only the summary, and no transcript replay on top.
  expect(api.calls.map((call) => call.resume)).toEqual(["sim-old", undefined]);
  expect(api.calls[1]?.prompt).toContain("Checked everything");
  expect(api.calls[1]?.prompt).not.toContain(
    "[Continuing an existing conversation.",
  );
  expect(frames).toContainEqual(
    expect.objectContaining({
      type: "context_compacted",
      data: { trigger: "proactive", pre_tokens: 190_000 },
    }),
  );
  const conversation = loadConversation(
    join(dirs.dataDir, "conversations"),
    ID,
  );
  // Delivered, so retired: the next turn resumes the new session.
  expect(conversation?.claudeCompaction).toBeUndefined();
  // The summary row carries the turn's boundary, the reply follows it: the
  // same transcript the pod's Claude autocompact leaves.
  expect(conversation?.messages.filter((m) => m.compaction)).toEqual([
    expect.objectContaining({
      role: "assistant",
      turnId: "t1",
      compaction: { trigger: "proactive", pre_tokens: 190_000 },
    }),
  ]);
  expect(lastAssistant(dirs.dataDir)?.turnId).toBe("t1");
});

test("a fresh Claude process sizes the CLI's first-byte deadline from the transcript's fill", async () => {
  target.model = claudeModel;
  const dirs = await directories();
  seedChat(dirs.dataDir, 150_000);
  const api = simulatedClaudeApi({
    windowTokens: 200_000,
    systemTokens: 1_000,
    runGrowthTokens: 0,
  });
  await seedClaudeSession(dirs, api, 150_000);

  await send(dirs, "t1", { claudeSdk: claudeSdk(api) });

  // 150k recorded, the question, and 100k of growth during the turn: 12.5 s
  // more than a small prompt's 15 s.
  expect(api.calls.map((call) => [call.resume, call.apiTimeoutMs])).toEqual([
    ["sim-old", "27500"],
  ]);
});

test("a summary a pod armed is delivered instead of a transcript replay", async () => {
  target.model = claudeModel;
  const dirs = await directories();
  seedChat(dirs.dataDir, 20_000);
  const dir = join(dirs.dataDir, "conversations");
  const conversation = loadConversation(dir, ID);
  if (!conversation) throw new Error("seeded conversation missing");
  saveConversation(dir, {
    ...conversation,
    claudeCompaction: {
      summary: "They asked me to remember the blue lantern.",
      createdAt: 1,
    },
  });
  writeTurnHarness(dirs.dataDir, ID, "claude");
  const api = simulatedClaudeApi({
    windowTokens: 200_000,
    systemTokens: 1_000,
    runGrowthTokens: 0,
  });

  await send(dirs, "t1", { claudeSdk: claudeSdk(api) });

  expect(api.calls).toHaveLength(1);
  expect(api.calls[0]?.prompt).toContain(
    "They asked me to remember the blue lantern.",
  );
  expect(api.calls[0]?.prompt).not.toContain(
    "[Continuing an existing conversation.",
  );
  expect(loadConversation(dir, ID)?.claudeCompaction).toBeUndefined();
});

test("leaving Claude retires its armed summary, like the pod's backend switch", async () => {
  target.model = {
    provider: "google",
    id: "gemini-test",
    contextWindow: 100_000,
  };
  const dirs = await directories();
  seedChat(dirs.dataDir, 20_000);
  const dir = join(dirs.dataDir, "conversations");
  const conversation = loadConversation(dir, ID);
  if (!conversation) throw new Error("seeded conversation missing");
  saveConversation(dir, {
    ...conversation,
    claudeCompaction: { summary: "stale summary", createdAt: 1 },
  });
  writeTurnHarness(dirs.dataDir, ID, "claude");
  const pi = piBackend(0, async () => undefined);

  await send(dirs, "t1", { createBackend: () => pi.backend });

  expect(pi.created[0]?.fresh).toBe(true);
  expect(loadConversation(dir, ID)?.claudeCompaction).toBeUndefined();
});

test("the assistant's compaction saves its durable facts through the turn's sandbox", async () => {
  target.model = {
    provider: "google",
    id: "gemini-test",
    contextWindow: 100_000,
  };
  const dirs = await directories();
  const dir = join(dirs.dataDir, "conversations");
  appendUserMessageAt(dir, "assistant", "I only take calls after 10am.", {
    turnId: "prior",
  });
  appendAssistantMessageAt(dir, "assistant", "Noted.", {
    turnId: "prior",
    usage: { context_tokens: 95_000, output_tokens: 10, cached_tokens: 0 },
  });
  const summary = [
    "They planned the week.",
    "```durable-facts",
    "They only take calls after 10am.",
    "```",
  ].join("\n");
  const pi = piBackend(95_000, async () => ({ summary }));
  const call = vi.fn(async () => Response.json({ ok: true }));

  await runTurn(
    dirs,
    {
      conversationId: "assistant",
      text: "Plan tomorrow.",
      provider: "google",
      emit: () => undefined,
      signal: undefined,
      turnId: "t1",
      sandbox: { call },
    },
    { createBackend: () => pi.backend },
  );

  expect(call).toHaveBeenCalledWith(
    "/sandbox/learnings/save",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ text: "They only take calls after 10am." }),
    }),
  );
});

test("a cancel during compaction stops the summary and the prompt never runs", async () => {
  target.model = {
    provider: "google",
    id: "gemini-test",
    contextWindow: 100_000,
  };
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const dirs = await directories();
  seedChat(dirs.dataDir, 95_000);
  const cancel = new AbortController();
  let stopSummary: (() => void) | undefined;
  const prompts: string[] = [];
  const backend: HarnessBackend = {
    id: "pi",
    async createSession() {
      return {
        subscribe: () => () => undefined,
        prompt: async (text) => {
          prompts.push(text);
        },
        abort: async () => stopSummary?.(),
        dispose: () => undefined,
        setModel: async () => undefined,
        compact: () =>
          new Promise((_, reject) => {
            stopSummary = () => reject(new Error("This operation was aborted"));
            // The person presses Stop while the summary is being written.
            cancel.abort();
          }),
        setThinkingLevel: () => undefined,
        getContextUsage: () => ({ tokens: 95_000 }),
      };
    },
  };

  const outcome = await runTurn(
    dirs,
    {
      conversationId: ID,
      text: "What did I ask you to remember?",
      provider: "google",
      emit: () => undefined,
      signal: cancel.signal,
      turnId: "t1",
    },
    { createBackend: () => backend },
  );

  expect(prompts).toEqual([]);
  expect(outcome).toEqual({});
});

/** A CLI transcript of `rounds` tool rounds, each result `chars` long. */
function toolTranscript(rounds: number, chars: number): string {
  const lines: string[] = [];
  for (let i = 0; i < rounds; i++) {
    lines.push(
      JSON.stringify({
        type: "assistant",
        message: {
          id: `msg_${i}`,
          role: "assistant",
          content: [
            { type: "tool_use", id: `toolu_${i}`, name: "mcp__houston__x" },
          ],
        },
      }),
      JSON.stringify({
        type: "user",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: `toolu_${i}`,
              content: [{ type: "text", text: `r${i} `.padEnd(chars, "x") }],
            },
          ],
        },
      }),
    );
  }
  return `${lines.join("\n")}\n`;
}

test("a Claude chat whose fill is mostly stale results clears them and does not compact", async () => {
  target.model = claudeModel;
  const dirs = await directories();
  // 195k recorded; six stale 80k-character results (the batches through
  // round 5) come off the resume, about 120k tokens, leaving ~75k.
  seedChat(dirs.dataDir, 195_000);
  const api = simulatedClaudeApi({
    windowTokens: 1_000_000,
    systemTokens: 1_000,
    runGrowthTokens: 0,
  });
  await seedClaudeSession(dirs, api, 195_000);
  const layout = turnClaudeLayout(dirs.turnRoot, dirs.dataDir, ID);
  const transcript = join(
    layout.configDir,
    "projects",
    dirs.workspaceDir.replace(/[^A-Za-z0-9]/g, "-"),
    "sim-old.jsonl",
  );
  await writeFile(transcript, toolTranscript(10, 80_000));
  const frames: WireFrame[] = [];

  await send(dirs, "t1", { claudeSdk: claudeSdk(api) }, frames);

  expect(api.calls.map((call) => call.resume)).toEqual(["sim-old"]);
  expect(frames.some((f) => f.type === "context_compacted")).toBe(false);
  // The cleared results were saved where their stubs point.
  expect(
    await readdir(join(dirs.workspaceDir, ".tool-results", ID)),
  ).toHaveLength(6);
});
