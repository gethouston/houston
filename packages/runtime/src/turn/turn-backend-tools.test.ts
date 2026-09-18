import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { expect, test, vi } from "vitest";
import { writeAuthFile } from "../auth/auth-file";
import type { TurnBackendDeps } from "./turn-backend";
import type { TurnSessionRequest } from "./turn-session";

/**
 * The provider branch must never decide what the agent can do: a tool the turn
 * was granted has to reach the pi backend and the Claude backend alike. Both
 * factories are mocked here so the assertion is about the tool LISTS they are
 * handed, which nothing else can observe.
 */

const piTools = vi.fn<(names: string[]) => void>();
const claudeTools = vi.fn<(names: string[]) => void>();

const piPrompt = vi.fn<(prompt: string | undefined) => void>();
const claudePrompt = vi.fn<(prompt: string | undefined) => void>();

vi.mock("../backends/pi/backend", () => ({
  createPiBackend: (deps: {
    customTools: { name: string }[];
    systemPrompt?: string;
  }) => {
    piTools(deps.customTools.map((tool) => tool.name));
    piPrompt(deps.systemPrompt);
    return { id: "pi", createSession: () => Promise.reject(new Error("stub")) };
  },
}));

vi.mock("../backends/claude/backend", () => ({
  ClaudeBackendUnavailableError: class extends Error {},
  createClaudeBackend: (deps: {
    tools: { name: string }[];
    systemPrompt?: string;
  }) => {
    claudeTools(deps.tools.map((tool) => tool.name));
    claudePrompt(deps.systemPrompt);
    return {
      id: "anthropic",
      createSession: () => Promise.reject(new Error("stub")),
    };
  },
}));

function deps(): TurnBackendDeps {
  const turnRoot = mkdtempSync(join(tmpdir(), "turn-backend-tools-"));
  const workspaceDir = join(turnRoot, "workspace");
  const dataDir = join(turnRoot, "data");
  mkdirSync(workspaceDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  writeAuthFile(join(dataDir, "auth.json"), {
    anthropic: { type: "api_key", key: "sk-ant-api03-test" },
  });
  const turn: TurnSessionRequest = {
    conversationId: "c1",
    text: "hello",
    provider: "anthropic",
    emit: () => undefined,
    signal: undefined,
    turnId: "t1",
  };
  return {
    directories: { workspaceDir, dataDir, turnRoot },
    turn,
    modelRuntime: {} as ModelRuntime,
    toolSelection: { toolNames: ["run_code"], includeRunCode: true },
    codeSandbox: {
      name: "run_code",
    } as unknown as TurnBackendDeps["codeSandbox"],
    systemPrompt: "system",
  };
}

test("a granted run_code reaches BOTH the pi and the Claude tool list", async () => {
  const { createTurnBackend } = await import("./turn-backend");
  createTurnBackend("openai-codex", deps());
  createTurnBackend("anthropic", deps());
  expect(piTools.mock.calls[0]?.[0]).toContain("run_code");
  expect(claudeTools.mock.calls[0]?.[0]).toContain("run_code");
  // The turn's prompt describes the turn's capabilities on BOTH branches; the
  // pi branch used to fall back to the PROCESS's prompt instead.
  expect(piPrompt.mock.calls[0]?.[0]).toBe("system");
  expect(claudePrompt.mock.calls[0]?.[0]).toBe("system");
});
