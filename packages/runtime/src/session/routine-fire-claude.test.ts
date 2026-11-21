import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { routineRunPreamble } from "@houston/domain";
import { beforeEach, expect, test, vi } from "vitest";
import type { ResolvedModel } from "../backends/types";

process.env.HOUSTON_HOME = mkdtempSync(join(tmpdir(), "houston-rovf-home-"));
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-rovf-ws-"),
);
process.env.HOUSTON_DATA_DIR = join(
  process.env.HOUSTON_WORKSPACE_DIR,
  ".houston",
  "runtime",
);

const target = vi.hoisted(() => ({
  model: {
    provider: "anthropic",
    id: "claude-opus-5",
    contextWindow: 1_000_000,
    reasoning: false,
  } as ResolvedModel,
}));
vi.mock("../ai/providers", async (importOriginal) => {
  const real = await importOriginal<typeof import("../ai/providers")>();
  return {
    ...real,
    resolveModel: () => target.model,
    activeEffort: () => null,
  };
});

await import("./conversation-cache");
const { runTurn, disposeConversation } = await import("./chat");
const { registerBackend } = await import("../backends/registry");
const { createClaudeBackend } = await import("../backends/claude/backend");
const { serverClaudeLayout } = await import("../backends/claude/paths");
const { SIMULATED_REPLY, simulatedClaudeApi } = await import(
  "../backends/claude/simulated-api.test-support"
);
const { toolSelection } = await import("./session-tools");
const { config } = await import("../config");
const { appendAssistantMessage, appendUserMessage, getHistory } = await import(
  "../store/conversations"
);
const { estimateTokens } = await import("./token-estimate");

const WINDOW = 200_000;
const PIN = {
  provider: "anthropic",
  model: "claude-opus-5",
  mode: "auto" as const,
};
const PROMPT = `${routineRunPreamble("Invoice watch")}Check the billing inbox for new invoices and list any that are overdue.`;

function useSimulatedApi() {
  const api = simulatedClaudeApi({
    windowTokens: WINDOW,
    systemTokens: 12_000,
    runGrowthTokens: 6_000,
  });
  const makeMcp = ((input: { name: string }) => ({
    type: "sdk",
    name: input.name,
    instance: {},
  })) as typeof createSdkMcpServer;
  registerBackend(
    "anthropic",
    createClaudeBackend({
      workspaceDir: config.workspaceDir,
      layout: serverClaudeLayout(config.dataDir),
      readToken: () => ({ kind: "api-key", value: "sk-ant-api-test" }),
      toolSelection,
      systemPrompt: "You are a test agent.",
      sdk: { query: api.query, createSdkMcpServer: makeMcp },
    }),
  );
  return api;
}

function seedRoutineChat(id: string, runs: number, lastFill: number): void {
  for (let run = 0; run < runs; run++) {
    appendUserMessage(id, PROMPT, { turnId: `${id}-run-${run}` });
    appendAssistantMessage(
      id,
      `Run ${run}: invoice INV-${1000 + run} is overdue.`,
      {
        turnId: `${id}-run-${run}`,
        usage: {
          context_tokens: Math.round((lastFill * (run + 1)) / runs),
          output_tokens: 300,
          cached_tokens: 0,
        },
      },
    );
  }
}

function seedSdkSession(
  api: ReturnType<typeof simulatedClaudeApi>,
  id: string,
  tokens: number,
): void {
  const layout = serverClaudeLayout(config.dataDir);
  api.seedSession("sim-old", tokens);
  const slug = config.workspaceDir.replace(/[^A-Za-z0-9]/g, "-");
  mkdirSync(join(layout.configDir, "projects", slug), { recursive: true });
  writeFileSync(
    join(layout.configDir, "projects", slug, "sim-old.jsonl"),
    "{}\n",
  );
  mkdirSync(dirname(layout.sessionsFile), { recursive: true });
  writeFileSync(layout.sessionsFile, JSON.stringify({ [id]: "sim-old" }));
}

const lastAssistant = (id: string) =>
  getHistory(id)
    ?.messages.filter((m) => m.role === "assistant")
    .at(-1);

const fireRoutine = (id: string) =>
  runTurn(
    id,
    PROMPT,
    undefined,
    PIN,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { routineFire: true },
  );

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

const DIGEST_HEAD = "[Earlier runs of this automation, newest first.";

const pointerIn = (prompt: string) =>
  /in the file (\S+), newest first/.exec(prompt)?.[1];

test("a fire after forty runs starts a fresh session on the instructions and a short digest", async () => {
  const id = "routine-invoice-watch";
  const api = useSimulatedApi();
  seedRoutineChat(id, 40, 91_000);
  seedSdkSession(api, id, 91_000);

  await fireRoutine(id);

  const call = api.calls.at(-1);
  expect(call?.resume).toBeUndefined();
  expect(call?.refused).toBe(false);
  const prompt = call?.prompt ?? "";
  expect(prompt.startsWith(DIGEST_HEAD)).toBe(true);
  expect(prompt.endsWith(PROMPT)).toBe(true);
  expect(prompt.split("Check the billing inbox")).toHaveLength(2);
  const digest = prompt.slice(0, -PROMPT.length);
  expect(digest).toContain(
    "run, finished: Run 39: invoice INV-1039 is overdue.",
  );
  expect(digest).not.toContain("INV-1034");
  expect(estimateTokens(digest)).toBeLessThanOrEqual(2_000);
  expect(lastAssistant(id)?.compaction).toBeUndefined();
  expect(lastAssistant(id)?.providerError).toBeUndefined();
});

test("the digest's pointer opens the full replies of runs the digest left out", async () => {
  const id = "routine-pointer";
  const api = useSimulatedApi();
  seedRoutineChat(id, 12, 40_000);

  await fireRoutine(id);

  const pointer = pointerIn(api.calls.at(-1)?.prompt ?? "");
  expect(pointer).toBe(`.houston/runtime/sessions/${id}/routine-results.md`);
  const results = readFileSync(
    join(config.workspaceDir, pointer ?? ""),
    "utf8",
  );
  expect(results).toContain("Run 11: invoice INV-1011 is overdue.");
  expect(results).toContain("Run 0: invoice INV-1000 is overdue.");
});

test("every fire drops the session the previous fire opened; a person's turn resumes it", async () => {
  const id = "routine-every-fire";
  const api = useSimulatedApi();
  seedRoutineChat(id, 3, 40_000);
  seedSdkSession(api, id, 40_000);

  await fireRoutine(id);
  const first = api.calls.at(-1);
  await disposeConversation(id);
  await fireRoutine(id);
  const second = api.calls.at(-1);
  await runTurn(id, "Draft the follow-up email.", undefined, PIN);
  const chat = api.calls.at(-1);

  expect(first?.resume).toBeUndefined();
  expect(second?.resume).toBeUndefined();
  expect(second?.prompt).toContain(`run, finished: ${SIMULATED_REPLY}`);
  expect(chat?.resume).toBe("sim-2");
  expect(chat?.prompt).toBe("Draft the follow-up email.");
});

test("a person chatting in a routine's chat keeps the session, whatever its size", async () => {
  const id = "routine-person-chatting";
  const api = useSimulatedApi();
  seedRoutineChat(id, 40, 150_000);
  seedSdkSession(api, id, 150_000);

  await runTurn(id, "Draft the follow-up email.", undefined, PIN);

  expect(api.calls.at(-1)?.resume).toBe("sim-old");
  expect(api.calls.at(-1)?.prompt).toBe("Draft the follow-up email.");
});

test("the first fire of a per-run routine sends the instructions alone", async () => {
  const id = "routine-per-run-a1b2";
  const api = useSimulatedApi();

  await fireRoutine(id);

  expect(api.calls.at(-1)?.resume).toBeUndefined();
  expect(api.calls.at(-1)?.prompt).toBe(PROMPT);
});

test("an ordinary chat is left on its session, whatever its size", async () => {
  const id = "chat-interactive";
  const api = useSimulatedApi();
  seedRoutineChat(id, 40, 150_000);
  seedSdkSession(api, id, 150_000);

  await runTurn(id, "What changed today?", undefined, PIN);

  expect(api.calls.at(-1)?.resume).toBe("sim-old");
});
