import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Options } from "@anthropic-ai/claude-agent-sdk";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { beforeEach, expect, test, vi } from "vitest";
import { applyServedCredential } from "../auth/auth-file";
import type { ClaudeSubscriptionType } from "../auth/claude-plan";
import { createTurnBackend } from "./turn-backend";
import { turnSessionRequest } from "./turn-request";
import type { TurnCredential, TurnRequest } from "./types";

const { built } = vi.hoisted(() => ({
  built: [] as { baseOptions: Options }[],
}));
vi.mock("../backends/claude/session", () => ({
  ClaudeSession: class {
    constructor(deps: { baseOptions: Options }) {
      built.push(deps);
    }
  },
}));

beforeEach(() => {
  built.length = 0;
});

const served = (subscriptionType?: ClaudeSubscriptionType): TurnCredential => ({
  provider: "anthropic",
  kind: "oauth",
  access: "sk-ant-oat01-served",
  expires: Date.now() + 3_600_000,
  accountId: null,
  ...(subscriptionType ? { subscriptionType } : {}),
});

async function turnEnv(
  credential: TurnCredential,
  onDisk: TurnCredential = credential,
): Promise<Record<string, string | undefined>> {
  const turnRoot = mkdtempSync(join(tmpdir(), "turn-claude-plan-"));
  const workspaceDir = join(turnRoot, "store", "workspace");
  const dataDir = join(turnRoot, "store", "data");
  mkdirSync(workspaceDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  applyServedCredential(join(dataDir, "auth.json"), onDisk);
  const request = {
    workspaceId: "ws",
    agentId: "agent",
    conversationId: "c1",
    text: "hi",
    gcsPrefix: "ws/ws/agent",
    credential,
  } satisfies TurnRequest;
  const backend = createTurnBackend("anthropic", {
    directories: { workspaceDir, dataDir, turnRoot },
    turn: turnSessionRequest(
      request,
      "t1",
      () => {},
      new AbortController().signal,
    ),
    modelRuntime: {} as ModelRuntime,
    toolSelection: { toolNames: [], includeRunCode: false },
    codeSandbox: null,
    systemPrompt: "system",
  });
  await backend.createSession({
    conversationId: "c1",
    model: { provider: "anthropic", id: "claude-sonnet-4-6", contextWindow: 1 },
  });
  return built[0]?.baseOptions.env ?? {};
}

test.each([
  "pro",
  "max",
] as const)("a served %s plan reaches the CLI with its token", async (plan) => {
  const env = await turnEnv(served(plan));
  expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe("sk-ant-oat01-served");
  expect(env.CLAUDE_CODE_SUBSCRIPTION_TYPE).toBe(plan);
});

test.each([
  "team",
  "enterprise",
  undefined,
] as const)("a %s plan leaves the CLI fetching its organization policy", async (plan) => {
  const env = await turnEnv(served(plan));
  expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe("sk-ant-oat01-served");
  expect(env).not.toHaveProperty("CLAUDE_CODE_SUBSCRIPTION_TYPE");
});

test("a plan never follows the turn onto a token it was not served with", async () => {
  const env = await turnEnv(served("max"), {
    ...served(),
    access: "sk-ant-oat01-another-login",
  });
  expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe("sk-ant-oat01-another-login");
  expect(env).not.toHaveProperty("CLAUDE_CODE_SUBSCRIPTION_TYPE");
});
