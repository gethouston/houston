import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, expect, test, vi } from "vitest";
import { applyOp } from "./op-apply";
import { WorkerOpDeclinedError } from "./op-provider-guard";
import { parseOpRequest } from "./parse-op-request";
import type { TurnFilesystem } from "./turn-filesystem";

const mocks = vi.hoisted(() => ({ generateTitle: vi.fn() }));

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

beforeEach(() => {
  mocks.generateTitle.mockReset();
});

test("a resolved anthropic title declines before pi is invoked", async () => {
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
    credential: {
      provider: "google",
      access: "served-key",
      expires: 0,
      kind: "api_key",
    },
    op: { kind: "title", text: "Conversation excerpt" },
  });
  const filesystem = {
    dataDir,
    dataRel: "data",
    workspaceDir,
    workspaceRel: "workspace",
  } as TurnFilesystem;

  await expect(applyOp(op, filesystem)).rejects.toThrow(WorkerOpDeclinedError);
  expect(mocks.generateTitle).not.toHaveBeenCalled();
});
