import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { expect, test, vi } from "vitest";
import { writeAuthFile } from "../auth/auth-file";
import type { TurnBackendDeps } from "./turn-backend";
import type { TurnSessionRequest } from "./turn-session";

const piTools = vi.fn<(names: string[]) => void>();
const piBrowserActions = vi.fn<(actions: string[]) => void>();
const claudeTools = vi.fn<(names: string[]) => void>();

const piPrompt = vi.fn<(prompt: string | undefined) => void>();
const piTransport = vi.fn<(transport: string | undefined) => void>();
const claudePrompt = vi.fn<(prompt: string | undefined) => void>();
const piRole = vi.fn<(role: string | null | undefined) => void>();
const claudeRole =
  vi.fn<
    (role: string | null | undefined, clamp: boolean | undefined) => void
  >();

function browserActions(tool: { parameters?: unknown }): string[] {
  const schema = tool.parameters as {
    properties: { action: { anyOf: { const: string }[] } };
  };
  return schema.properties.action.anyOf.map((option) => option.const);
}

vi.mock("../backends/pi/backend", () => ({
  createPiBackend: (deps: {
    customTools: { name: string; parameters?: unknown }[];
    systemPrompt?: string;
    transport?: string;
    role?: string | null;
  }) => {
    piTools(deps.customTools.map((tool) => tool.name));
    const browser = deps.customTools.find((tool) => tool.name === "browser");
    if (browser) piBrowserActions(browserActions(browser));
    piRole(deps.role);
    piPrompt(deps.systemPrompt);
    piTransport(deps.transport);
    return { id: "pi", createSession: () => Promise.reject(new Error("stub")) };
  },
}));

vi.mock("../backends/claude/backend", () => ({
  ClaudeBackendUnavailableError: class extends Error {},
  createClaudeBackend: (deps: {
    tools: { name: string }[];
    systemPrompt?: string;
    role?: string | null;
    personalAssistant?: boolean;
  }) => {
    claudeTools(deps.tools.map((tool) => tool.name));
    claudeRole(deps.role, deps.personalAssistant);
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
  expect(piPrompt.mock.calls[0]?.[0]).toBe("system");
  expect(claudePrompt.mock.calls[0]?.[0]).toBe("system");
});

test("a pooled turn pins pi to SSE: the Codex WebSocket is never reused here", async () => {
  const { createTurnBackend } = await import("./turn-backend");
  piTransport.mockClear();
  createTurnBackend("openai-codex", deps());
  expect(piTransport.mock.calls).toEqual([["sse"]]);
});

test("both branches carry the follow-up tools the product prompt mandates", async () => {
  const { createTurnBackend } = await import("./turn-backend");
  piTools.mockClear();
  claudeTools.mockClear();
  createTurnBackend("openai-codex", deps());
  createTurnBackend("anthropic", deps());
  for (const names of [
    piTools.mock.calls[0]?.[0],
    claudeTools.mock.calls[0]?.[0],
  ]) {
    expect(names).toContain("suggest_actions");
    expect(names).toContain("suggest_reusable");
  }
});

test("a coordinator turn tells BOTH branches its role", async () => {
  const { createTurnBackend } = await import("./turn-backend");
  piRole.mockClear();
  claudeRole.mockClear();
  const coordinator = deps();
  coordinator.turn.role = "coordinator";
  createTurnBackend("openai-codex", coordinator);
  createTurnBackend("anthropic", coordinator);
  expect(piRole.mock.calls[0]?.[0]).toBe("coordinator");
  expect(claudeRole.mock.calls[0]).toEqual(["coordinator", true]);
  createTurnBackend("openai-codex", deps());
  createTurnBackend("anthropic", deps());
  expect(piRole.mock.calls[1]?.[0]).toBeNull();
  expect(claudeRole.mock.calls[1]).toEqual([null, false]);
});

test("a selected browser reaches BOTH branches; an unselected one neither", async () => {
  const { createTurnBackend } = await import("./turn-backend");
  piTools.mockClear();
  claudeTools.mockClear();
  const browsing = deps();
  browsing.toolSelection = {
    toolNames: ["run_code", "browser"],
    includeRunCode: true,
  };
  createTurnBackend("openai-codex", browsing);
  createTurnBackend("anthropic", browsing);
  expect(piTools.mock.calls[0]?.[0]).toContain("browser");
  expect(claudeTools.mock.calls[0]?.[0]).toContain("browser");
  createTurnBackend("openai-codex", deps());
  createTurnBackend("anthropic", deps());
  expect(piTools.mock.calls[1]?.[0]).not.toContain("browser");
  expect(claudeTools.mock.calls[1]?.[0]).not.toContain("browser");
});

test("the browser offers handoff only when the turn's grant carries browser-live", async () => {
  const { createTurnBackend } = await import("./turn-backend");
  piBrowserActions.mockClear();
  for (const scopes of [["browser-live"], ["code-run"], undefined] as const) {
    const browsing = deps();
    browsing.toolSelection = { toolNames: ["browser"], includeRunCode: false };
    if (scopes) browsing.turn.grant = { scopes: [...scopes] };
    createTurnBackend("openai-codex", browsing);
  }
  const offered = piBrowserActions.mock.calls.map(([actions]) =>
    actions.includes("handoff"),
  );
  expect(offered).toEqual([true, false, false]);
});
