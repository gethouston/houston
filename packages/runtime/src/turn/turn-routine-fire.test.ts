import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { routineRunPreamble } from "@houston/domain";
import type { ChatMessage, WireFrame } from "@houston/runtime-client";
import { beforeEach, expect, test, vi } from "vitest";
import { writeAuthFile } from "../auth/auth-file";
import {
  SIMULATED_REPLY,
  simulatedClaudeApi,
} from "../backends/claude/simulated-api.test-support";
import type {
  CreateSessionOptions,
  HarnessBackend,
  HarnessSession,
  ResolvedModel,
} from "../backends/types";
import { estimateTokens } from "../session/token-estimate";
import { segments } from "../store/conversation-archive";
import {
  appendAssistantMessageAt,
  appendUserMessageAt,
  loadConversation,
  saveConversation,
} from "../store/conversation-file";
import { createTurnBackend, turnClaudeLayout } from "./turn-backend";
import {
  type RunTurnDeps,
  runTurn,
  type TurnDirectories,
} from "./turn-session";

/**
 * The routine context rule on a POOLED worker: every turn hydrates the
 * conversation and, unless it is a fire, resumes its native session (the
 * Claude SDK session named in `sessions.json`, or pi's newest tail). A fire
 * deletes that session and starts fresh on the digest.
 */

const target = vi.hoisted(() => ({
  model: {
    provider: "anthropic",
    id: "claude-opus-5",
    contextWindow: 1_000_000,
    reasoning: false,
  } as ResolvedModel,
}));
vi.mock("./turn-runtime", () => ({
  createTurnModelRuntime: async () => ({
    modelRuntime: {},
    model: target.model,
  }),
}));

const WINDOW = 200_000;
const PROMPT = `${routineRunPreamble("Invoice watch")}Check the billing inbox for new invoices and list any that are overdue.`;
const ID = "routine-invoice-watch";

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

/** The standing layout: the runtime's data inside the agent's folder. */
async function directories(): Promise<TurnDirectories> {
  const turnRoot = await mkdtemp(join(tmpdir(), "routine-pooled-"));
  const workspaceDir = join(turnRoot, "store", "workspaces", "Personal", "Bob");
  const dataDir = join(workspaceDir, ".houston", "runtime");
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

/** A routine chat that ran `runs` times, the last run ending at `lastFill`. */
function seedRoutineChat(dataDir: string, runs: number, lastFill: number) {
  const dir = join(dataDir, "conversations");
  for (let run = 0; run < runs; run++) {
    appendUserMessageAt(dir, ID, PROMPT, { turnId: `run-${run}` });
    appendAssistantMessageAt(
      dir,
      ID,
      `Run ${run}: INV-${1000 + run} is overdue.`,
      {
        turnId: `run-${run}`,
        usage: {
          context_tokens: Math.round((lastFill * (run + 1)) / runs),
          output_tokens: 300,
          cached_tokens: 0,
        },
      },
    );
  }
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
  api.seedSession("sim-old", tokens);
  return join(slugDir, "sim-old.jsonl");
}

function claudeSdk(api: ReturnType<typeof simulatedClaudeApi>) {
  const makeMcp = ((input: { name: string }) => ({
    type: "sdk",
    name: input.name,
    instance: {},
  })) as typeof createSdkMcpServer;
  return { query: api.query, createSdkMcpServer: makeMcp };
}

async function fire(
  dirs: TurnDirectories,
  turnId: string,
  deps: Parameters<typeof runTurn>[2],
  frames: WireFrame[] = [],
) {
  return runTurn(
    dirs,
    {
      conversationId: ID,
      text: PROMPT,
      provider: target.model.provider,
      emit: (frame) => frames.push(frame),
      signal: undefined,
      turnId,
      mode: "auto",
      routineFire: true,
    },
    deps,
  );
}

/**
 * Five short reports, then a run whose tool output alone outgrows the live
 * file: saving it rotates the five reports into an archive segment and leaves
 * only that last run live.
 */
function seedRotatedChat(dataDir: string): void {
  const conversationsDir = join(dataDir, "conversations");
  const messages: ChatMessage[] = [];
  for (let n = 0; n < 5; n++)
    messages.push(
      { role: "user", content: PROMPT, ts: n, turnId: `r${n}` },
      {
        role: "assistant",
        content: `Report r${n}: INV-${n} is overdue.`,
        ts: n,
        turnId: `r${n}`,
      },
    );
  messages.push(
    { role: "user", content: PROMPT, ts: 5, turnId: "r5" },
    {
      role: "assistant",
      content: "Report r5: nothing new.",
      ts: 5,
      turnId: "r5",
      tools: [{ name: "Read", result: "row;".repeat(2_300_000) }],
    },
  );
  saveConversation(conversationsDir, {
    id: ID,
    title: "Routine",
    createdAt: 1,
    updatedAt: 1,
    messages,
  });
  expect(loadConversation(conversationsDir, ID)?.messages).toHaveLength(2);
}

const lastAssistant = (dataDir: string) =>
  loadConversation(join(dataDir, "conversations"), ID)
    ?.messages.filter((m) => m.role === "assistant")
    .at(-1);

/** A person's turn in the routine's chat: no `routineFire`. */
async function chat(
  dirs: TurnDirectories,
  turnId: string,
  text: string,
  deps: Parameters<typeof runTurn>[2],
) {
  return runTurn(
    dirs,
    {
      conversationId: ID,
      text,
      provider: target.model.provider,
      emit: () => undefined,
      signal: undefined,
      turnId,
      mode: "auto",
    },
    deps,
  );
}

const simulated = () =>
  simulatedClaudeApi({
    windowTokens: WINDOW,
    systemTokens: 12_000,
    runGrowthTokens: 6_000,
  });

const useClaude = () => {
  target.model = {
    ...target.model,
    provider: "anthropic",
    id: "claude-opus-5",
  };
};

/** A pi backend that records each session it opens and the prompts it gets. */
function fakePi(calls: { options: CreateSessionOptions; prompts: string[] }[]) {
  const pi: HarnessBackend = {
    id: "pi",
    async createSession(options) {
      const call = { options, prompts: [] as string[] };
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
  target.model = {
    provider: "openai-codex",
    id: "gpt-5.5",
    contextWindow: 272_000,
    reasoning: false,
  };
  const deps: RunTurnDeps = {
    createBackend: (provider, input) =>
      provider === "anthropic" ? createTurnBackend(provider, input) : pi,
  };
  return deps;
}

const DIGEST_HEAD = "[Earlier runs of this automation, newest first.";

test("a pooled Claude fire drops the old session and starts on the digest and the instructions", async () => {
  useClaude();
  const dirs = await directories();
  const api = simulated();
  seedRoutineChat(dirs.dataDir, 40, 91_000);
  const oldTranscript = await seedClaudeSession(dirs, api, 91_000);
  const frames: WireFrame[] = [];

  await fire(dirs, "fire-1", { claudeSdk: claudeSdk(api) }, frames);

  const call = api.calls.at(-1);
  expect(call?.resume).toBeUndefined();
  const prompt = call?.prompt ?? "";
  expect(prompt.startsWith(DIGEST_HEAD)).toBe(true);
  expect(prompt.endsWith(PROMPT)).toBe(true);
  expect(prompt).toContain("run, finished: Run 39: INV-1039 is overdue.");
  expect(estimateTokens(prompt.slice(0, -PROMPT.length))).toBeLessThanOrEqual(
    2_000,
  );
  // The overgrown session is deleted, so the sync-back deletes it remotely
  // and no later worker hydrates it again.
  expect(existsSync(oldTranscript)).toBe(false);
  expect(frames.some((f) => f.type === "context_compacted")).toBe(false);
  expect(lastAssistant(dirs.dataDir)?.compaction).toBeUndefined();
  // The pointer opens, from the agent's folder, the replies the digest cut.
  const pointer = /in the file (\S+), newest first/.exec(prompt)?.[1] ?? "";
  expect(pointer).toBe(`.houston/runtime/sessions/${ID}/routine-results.md`);
  expect(readFileSync(join(dirs.workspaceDir, pointer), "utf8")).toContain(
    "Run 0: INV-1000 is overdue.",
  );
});

test("the next pooled fire starts fresh again, and a person's turn resumes it", async () => {
  useClaude();
  const dirs = await directories();
  const api = simulated();
  seedRoutineChat(dirs.dataDir, 3, 40_000);
  await seedClaudeSession(dirs, api, 40_000);

  await fire(dirs, "fire-1", { claudeSdk: claudeSdk(api) });
  await fire(dirs, "fire-2", { claudeSdk: claudeSdk(api) });
  await chat(dirs, "chat-1", "Draft the follow-up email.", {
    claudeSdk: claudeSdk(api),
  });

  expect(api.calls.map((c) => c.resume)).toEqual([
    undefined,
    undefined,
    "sim-2",
  ]);
  expect(api.calls[1]?.prompt).toContain(`run, finished: ${SIMULATED_REPLY}`);
  expect(api.calls[2]?.prompt).toBe("Draft the follow-up email.");
});

test("a pooled fire after a rotation remembers the runs the archive holds", async () => {
  useClaude();
  const dirs = await directories();
  const api = simulated();
  seedRotatedChat(dirs.dataDir);

  await fire(dirs, "after-rotation", { claudeSdk: claudeSdk(api) });

  const prompt = api.calls.at(-1)?.prompt ?? "";
  expect(prompt).toContain("run, finished: Report r5: nothing new.");
  expect(prompt).toContain("run, finished: Report r3: INV-3 is overdue.");
  // The 9 MB of tool output the last run read is not in it.
  expect(prompt.length).toBeLessThan(8_000);
});

test("a pooled pi fire opens a fresh pi session on the digest", async () => {
  const dirs = await directories();
  const calls: { options: CreateSessionOptions; prompts: string[] }[] = [];
  const deps = fakePi(calls);
  seedRoutineChat(dirs.dataDir, 40, 180_000);
  const sessionDir = join(dirs.dataDir, "sessions", ID);
  await mkdir(sessionDir, { recursive: true });
  await writeFile(
    join(sessionDir, "2026-09-01T00-00-00-000Z_old.jsonl"),
    `${JSON.stringify({ type: "session" })}\n`,
  );

  await fire(dirs, "pi-fire", deps);

  expect(calls[0]?.options.fresh).toBe(true);
  const prompt = calls[0]?.prompts[0] ?? "";
  expect(prompt.startsWith(DIGEST_HEAD)).toBe(true);
  expect(prompt.endsWith(PROMPT)).toBe(true);
  expect(await readdir(sessionDir)).not.toContain(
    "2026-09-01T00-00-00-000Z_old.jsonl",
  );
});

test("a person's pooled pi turn resumes without reading archived history", async () => {
  const dirs = await directories();
  const calls: { options: CreateSessionOptions; prompts: string[] }[] = [];
  const deps = fakePi(calls);
  seedRotatedChat(dirs.dataDir);
  const sessionDir = join(dirs.dataDir, "sessions", ID);
  await mkdir(sessionDir, { recursive: true });
  await writeFile(
    join(sessionDir, "2026-09-01T00-00-00-000Z_live.jsonl"),
    `${JSON.stringify({ type: "session" })}\n`,
  );
  segments.clear();

  await chat(dirs, "pi-chat", "Which invoices are still open?", deps);

  expect(calls[0]?.options.fresh).toBeUndefined();
  expect(calls[0]?.prompts).toEqual(["Which invoices are still open?"]);
  expect(segments.size).toBe(0);
});

test("a person's turn whose Claude resume is refused retries on the digest from the archive", async () => {
  useClaude();
  const dirs = await directories();
  const api = simulated();
  seedRotatedChat(dirs.dataDir);
  // The mapping names a transcript the API no longer knows: the resume is
  // refused ("No conversation found") and the turn reruns fresh.
  await seedClaudeSession(dirs, api, 40_000);
  const unknown = simulated();

  await chat(dirs, "rejected-resume", "Anything new?", {
    claudeSdk: claudeSdk(unknown),
  });

  expect(unknown.calls.at(-1)?.resume).toBeUndefined();
  expect(unknown.calls.at(-1)?.prompt).toContain(
    "Report r3: INV-3 is overdue.",
  );
});
