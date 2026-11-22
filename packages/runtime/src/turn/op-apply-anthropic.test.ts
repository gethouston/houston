import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, expect, test, vi } from "vitest";
import { applyOp } from "./op-apply";
import { WorkerOpDeclinedError } from "./op-provider-guard";
import { parseOpRequest } from "./parse-op-request";
import type { TurnFilesystem } from "./turn-filesystem";

const mocks = vi.hoisted(() => ({
  generateTitle: vi.fn(),
  titleWithClaude: vi.fn(),
}));

vi.mock("./turn-runtime", () => ({
  createTurnModelRuntime: async () => ({
    modelRuntime: {},
    model: {
      provider: "anthropic",
      id: "claude-sonnet-4-6",
      contextWindow: 200_000,
    },
  }),
}));

vi.mock("../session/summarize", () => ({
  generateTitle: mocks.generateTitle,
}));

vi.mock("../backends/claude/title", () => ({
  titleWithClaude: mocks.titleWithClaude,
}));

beforeEach(() => {
  mocks.generateTitle.mockReset();
  mocks.titleWithClaude.mockReset();
});

function titleOp(credential: Record<string, unknown>) {
  const root = mkdtempSync(join(tmpdir(), "op-provider-guard-"));
  const dataDir = join(root, "data");
  const workspaceDir = join(root, "workspace");
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(workspaceDir, { recursive: true });
  const op = parseOpRequest({
    workspaceId: "w1",
    agentId: "a1",
    gcsPrefix: "ws/w1/a1",
    hostToken: "host-token",
    claim: {
      id: "claim-1",
      bootId: "boot-1",
      token: "claim-token",
      heartbeatUrl: "https://gateway.test/heartbeat",
    },
    credential,
    op: { kind: "title", text: "  Conversation excerpt  " },
  });
  const filesystem = {
    dataDir,
    dataRel: "data",
    workspaceDir,
    workspaceRel: "workspace",
  } as TurnFilesystem;
  return { op, filesystem };
}

test("a resolved anthropic title declines before pi is invoked", async () => {
  const { op, filesystem } = titleOp({
    provider: "google",
    access: "served-key",
    expires: 0,
    kind: "api_key",
  });

  await expect(applyOp(op, filesystem)).rejects.toThrow(WorkerOpDeclinedError);
  expect(mocks.generateTitle).not.toHaveBeenCalled();
  expect(mocks.titleWithClaude).not.toHaveBeenCalled();
});

test("an anthropic title runs through the Claude SDK on the served token", async () => {
  const access = "sk-ant-oat01-served";
  const { op, filesystem } = titleOp({
    provider: "anthropic",
    access,
    expires: Date.now() + 3_600_000,
  });
  mocks.titleWithClaude.mockResolvedValue("Weekly sales report");

  const result = await applyOp(op, filesystem);

  expect(result.status).toBe(200);
  expect(JSON.parse(String(result.body))).toEqual({
    title: "Weekly sales report",
  });
  expect(mocks.generateTitle).not.toHaveBeenCalled();
  const params = mocks.titleWithClaude.mock.calls[0]?.[0];
  expect(params).toMatchObject({
    excerpt: "Conversation excerpt",
    workspaceDir: filesystem.workspaceDir,
    dataDir: filesystem.dataDir,
    modelId: "claude-sonnet-4-6",
  });
  expect(params.readToken()).toMatchObject({
    kind: "oauth-token",
    value: access,
  });
});

test("an anthropic title carries the served plan and a deadline", async () => {
  const access = "sk-ant-oat01-served";
  const { op, filesystem } = titleOp({
    provider: "anthropic",
    access,
    expires: Date.now() + 3_600_000,
    subscriptionType: "max",
  });
  mocks.titleWithClaude.mockResolvedValue("Weekly sales report");

  await applyOp(op, filesystem);

  const params = mocks.titleWithClaude.mock.calls[0]?.[0];
  expect(params.readToken()).toMatchObject({
    kind: "oauth-token",
    value: access,
    subscriptionType: "max",
  });
  expect(params.signal).toBeInstanceOf(AbortSignal);
});
