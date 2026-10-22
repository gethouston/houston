import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type {
  createSdkMcpServer,
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { beforeEach, expect, test, vi } from "vitest";
import type { ClaudeQuery } from "../backends/claude/session";
import type { ResolvedModel } from "../backends/types";

/**
 * A Claude chat of 800k tokens, through the standing server's real turn path
 * and the real Claude Agent SDK backend: every turn's CLI must get a
 * first-byte deadline (`API_TIMEOUT_MS`) long enough for Anthropic to read
 * the conversation, whatever rebuilt its session and whatever the last
 * request did. Only the Anthropic API is simulated.
 */

process.env.HOUSTON_HOME = mkdtempSync(join(tmpdir(), "houston-cfb-home-"));
process.env.HOUSTON_DATA_DIR = mkdtempSync(join(tmpdir(), "houston-cfb-data-"));
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-cfb-ws-"),
);

vi.mock("../ai/providers", async (importOriginal) => {
  const real = await importOriginal<typeof import("../ai/providers")>();
  const model: ResolvedModel = {
    provider: "anthropic",
    id: "claude-sonnet-4-6",
    contextWindow: 1_000_000,
    reasoning: false,
  };
  return { ...real, resolveModel: () => model, activeEffort: () => null };
});

const { getConversation } = await import("./conversation-cache");
const { runTurn, disposeConversation } = await import("./chat");
const { registerBackend } = await import("../backends/registry");
const { createClaudeBackend } = await import("../backends/claude/backend");
const { serverClaudeLayout } = await import("../backends/claude/paths");
const { simulatedClaudeApi } = await import(
  "../backends/claude/simulated-api.test-support"
);
const { toolSelection } = await import("./session-tools");
const { config } = await import("../config");
const { appendAssistantMessage, appendUserMessage } = await import(
  "../store/conversations"
);

const PIN = {
  provider: "anthropic",
  model: "claude-sonnet-4-6",
  mode: "execute" as const,
};
const FILL = 800_000;

/** The CLI's answer to a request Anthropic never opened. */
function* timedOut(sessionId: string): Generator<SDKMessage> {
  yield { type: "system", subtype: "init", session_id: sessionId } as never;
  yield {
    type: "result",
    subtype: "error_during_execution",
    is_error: true,
    errors: ["API Error: Request timed out."],
    usage: { input_tokens: 0, output_tokens: 0 },
    session_id: sessionId,
  } as never;
}

/** A chat whose last reply recorded `FILL`, resuming an SDK session that big. */
function seedLongChat(id: string) {
  const api = simulatedClaudeApi({
    windowTokens: 2_000_000,
    systemTokens: 12_000,
    runGrowthTokens: 1_000,
  });
  const timeouts: (string | undefined)[] = [];
  let failNext = false;
  const query: ClaudeQuery = (params) => {
    timeouts.push(params.options.env?.API_TIMEOUT_MS);
    if (!failNext) return api.query(params);
    failNext = false;
    return (async function* () {
      yield* timedOut(params.options.resume ?? "sim-new");
    })();
  };
  registerBackend(
    "anthropic",
    createClaudeBackend({
      workspaceDir: config.workspaceDir,
      layout: serverClaudeLayout(config.dataDir),
      readToken: () => ({ kind: "api-key", value: "sk-ant-api-test" }),
      toolSelection,
      systemPrompt: "You are a test agent.",
      sdk: {
        query,
        createSdkMcpServer: ((input: { name: string }) => ({
          type: "sdk",
          name: input.name,
          instance: {},
        })) as typeof createSdkMcpServer,
      },
    }),
  );
  appendUserMessage(id, "Read every contract in the archive.");
  appendAssistantMessage(id, "Read all 412 contracts.", {
    usage: { context_tokens: FILL, output_tokens: 300, cached_tokens: 0 },
  });
  const layout = serverClaudeLayout(config.dataDir);
  api.seedSession("sim-old", FILL);
  const slug = config.workspaceDir.replace(/[^A-Za-z0-9]/g, "-");
  mkdirSync(join(layout.configDir, "projects", slug), { recursive: true });
  writeFileSync(
    join(layout.configDir, "projects", slug, "sim-old.jsonl"),
    "{}\n",
  );
  mkdirSync(dirname(layout.sessionsFile), { recursive: true });
  writeFileSync(layout.sessionsFile, JSON.stringify({ [id]: "sim-old" }));
  return {
    timeouts,
    failNextRequest: () => {
      failNext = true;
    },
  };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

test("a turn after a timed-out request still waits for the whole chat", async () => {
  const id = "chat-timed-out";
  const chat = seedLongChat(id);
  chat.failNextRequest();

  await runTurn(id, "Which contracts renew this month?", undefined, PIN);
  // The next turn may run in a fresh process: it reads the recorded fill.
  await disposeConversation(id);
  await runTurn(id, "Which contracts renew this month?", undefined, PIN);

  expect(chat.timeouts.map(Number)).toEqual([60_000, 60_000]);
});

test("a turn that switches mode still waits for the whole chat", async () => {
  const id = "chat-mode-switch";
  const chat = seedLongChat(id);

  await getConversation(id, PIN);
  await runTurn(id, "Plan the renewals.", undefined, { ...PIN, mode: "plan" });

  expect(chat.timeouts.map(Number)).toEqual([60_000]);
});
