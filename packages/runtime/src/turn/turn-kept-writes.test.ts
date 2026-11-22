import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import type { TurnBackendDeps } from "./turn-backend";
import { claimedTurnKeepsWrite } from "./turn-filesystem-scope";
import type { TurnSessionRequest } from "./turn-session";
import {
  finishTurnSessionStartup,
  type RunTurnDeps,
  startTurnSession,
} from "./turn-session-startup";

const LAYOUT = {
  workspaceRel: "workspaces/Personal/Bob",
  dataRel: "workspaces/Personal/Bob/.houston/runtime",
};

test.each([
  ["notes.md", true],
  [".houston/state.json", true],
  [".houston/state/watermark.json", true],
  [".houston/routine_runs/routine_runs.json", true],
  [".houston/activity/activity.json", true],
  [".houston/runtime/conversations/c1.json", true],
  [".houston/runtime/conversations/c2.json", false],
  [".houston/config/config.json", false],
  [".houston/config.json", false],
  [".houston/agent.json", false],
  [".houston/skills-manifest/skills-manifest.json", false],
])("a claimed turn keeps %s: %s", (rel, kept) => {
  expect(claimedTurnKeepsWrite(LAYOUT, "c1")(rel)).toBe(kept);
});

async function fileGuardFor(claimed: boolean) {
  const root = mkdtempSync(join(tmpdir(), "turn-kept-"));
  const workspaceDir = join(root, "store", LAYOUT.workspaceRel);
  mkdirSync(workspaceDir, { recursive: true });
  let captured: TurnBackendDeps | null = null;
  const deps: RunTurnDeps = {
    claudeSdk: {
      query: async function* () {},
      createSdkMcpServer: (() => ({})) as unknown as typeof createSdkMcpServer,
    },
    createModelRuntime: (async () => ({
      modelRuntime: {} as ModelRuntime,
      model: { provider: "google", id: "test-model", contextWindow: 1000 },
    })) as unknown as RunTurnDeps["createModelRuntime"],
    createBackend: (_provider, backendDeps) => {
      captured = backendDeps;
      return {
        id: "stub",
        createSession: () => Promise.reject(new Error("not used")),
      };
    },
  };
  const turn: TurnSessionRequest = {
    conversationId: "c1",
    text: "hello",
    provider: "google",
    emit: () => undefined,
    signal: undefined,
    turnId: "t1",
    ...(claimed ? { claimed: true } : {}),
  };
  await finishTurnSessionStartup(
    startTurnSession(
      {
        workspaceDir,
        dataDir: join(workspaceDir, ".houston", "runtime"),
        turnRoot: root,
        ...LAYOUT,
      },
      turn,
      deps,
    ),
  );
  const built: TurnBackendDeps | null = captured;
  if (!built) throw new Error("backend was never created");
  return (built as TurnBackendDeps).fileGuard;
}

test("a claimed turn's file tools refuse what its sync would drop", async () => {
  const guard = await fileGuardFor(true);
  expect(guard?.keepsWrite?.(".houston/config/config.json")).toBe(false);
  expect(guard?.keepsWrite?.(".houston/state.json")).toBe(true);
});

test("an unclaimed turn keeps its whole tree, so nothing is refused", async () => {
  const guard = await fileGuardFor(false);
  expect(guard?.keepsWrite).toBeUndefined();
});
