import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import type {
  ExtensionContext,
  ModelRuntime,
} from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test, vi } from "vitest";
import type { SandboxFetch } from "../session/tools/sandbox-fetch";
import type { TurnBackendDeps } from "./turn-backend";
import type { TurnSessionRequest } from "./turn-session";
import type { TurnGrantScope } from "./types";

/**
 * The end of the `run_code` wiring in turn mode: a worker configured for remote
 * code execution only gets the tool when the TURN's grant carries `code-run`,
 * and when it does, the tool is bound to the turn's own sandbox facade — never
 * to a sandbox URL or token this process holds (it holds none).
 *
 * The backend is stubbed so the assertions are about the selection handed to
 * it, on BOTH provider branches; turn-backend.ts is what puts `codeSandbox`
 * into each branch's tool list, and its own test covers that.
 */

const OWNED = [
  "HOUSTON_MODE",
  "HOUSTON_CODE_EXECUTION",
  "HOUSTON_CODE_SANDBOX_URL",
  "HOUSTON_WORKSPACE_DIR",
  "HOUSTON_DATA_DIR",
  "HOUSTON_RUN_CODE_MAX_CONCURRENT",
] as const;
const prior = new Map(OWNED.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of OWNED) {
    const value = prior.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
});

const okCall: SandboxFetch = async () => Response.json({});

function turn(
  provider: string,
  scopes: TurnGrantScope[] | null,
  call: SandboxFetch = okCall,
  warmCode?: () => void,
): TurnSessionRequest {
  return {
    conversationId: "c1",
    text: "hello",
    provider,
    emit: () => undefined,
    signal: undefined,
    turnId: "t1",
    ...(scopes ? { grant: { scopes }, sandbox: { call, warmCode } } : {}),
  };
}

/** Load turn-session-startup fresh against one deployment's environment. */
async function loadStartup(
  codeExecution: string,
  env: Record<string, string> = {},
) {
  for (const key of OWNED) delete process.env[key];
  process.env.HOUSTON_MODE = "turn";
  process.env.HOUSTON_CODE_EXECUTION = codeExecution;
  const configRoot = mkdtempSync(join(tmpdir(), "turn-code-cfg-"));
  process.env.HOUSTON_WORKSPACE_DIR = join(configRoot, "workspace");
  process.env.HOUSTON_DATA_DIR = join(configRoot, "data");
  Object.assign(process.env, env);
  vi.resetModules();
  return import("./turn-session-startup");
}

/** Start one turn on a loaded worker and capture the backend deps it built. */
async function startTurnOn(
  startup: Awaited<ReturnType<typeof loadStartup>>,
  input: {
    provider: string;
    scopes: TurnGrantScope[] | null;
    call?: SandboxFetch;
    warmCode?: () => void;
  },
): Promise<TurnBackendDeps> {
  const { startTurnSession, finishTurnSessionStartup } = startup;
  const root = mkdtempSync(join(tmpdir(), "turn-code-"));
  type RunTurnDeps = NonNullable<Parameters<typeof startTurnSession>[2]>;
  let captured: TurnBackendDeps | null = null;
  const deps: RunTurnDeps = {
    // A stub SDK keeps the anthropic branch from importing the real one.
    claudeSdk: {
      query: async function* () {},
      createSdkMcpServer: (() => ({})) as unknown as typeof createSdkMcpServer,
    },
    createModelRuntime: (async () => ({
      modelRuntime: {} as ModelRuntime,
      model: {
        provider: input.provider,
        id: "test-model",
        contextWindow: 1000,
      },
    })) as unknown as RunTurnDeps["createModelRuntime"],
    createBackend: (_provider, backendDeps) => {
      captured = backendDeps;
      return {
        id: "stub",
        createSession: () => Promise.reject(new Error("not used")),
      };
    },
  };
  await finishTurnSessionStartup(
    startTurnSession(
      {
        workspaceDir: join(root, "workspace"),
        dataDir: join(root, "data"),
        turnRoot: root,
      },
      turn(input.provider, input.scopes, input.call, input.warmCode),
      deps,
    ),
  );
  if (!captured) throw new Error("backend was never created");
  return captured;
}

/** The common case: one worker, one turn. */
async function startupDeps(input: {
  codeExecution: string;
  provider: string;
  scopes: TurnGrantScope[] | null;
}): Promise<TurnBackendDeps> {
  return startTurnOn(await loadStartup(input.codeExecution), input);
}

test.each([
  "anthropic",
  "openai-codex",
])("remote + the code-run scope gives a %s turn run_code bound to its own facade", async (provider) => {
  const deps = await startupDeps({
    codeExecution: "remote",
    provider,
    scopes: ["code-run"],
  });
  expect(deps.toolSelection.toolNames).toContain("run_code");
  expect(deps.codeSandbox?.name).toBe("run_code");
  // The prompt must agree with the allowlist, or the model claims an ability
  // it does not have.
  expect(deps.systemPrompt).toContain("run commands");
});

test.each([
  "anthropic",
  "openai-codex",
])("remote WITHOUT the scope leaves a %s turn with no run_code and a matching prompt", async (provider) => {
  const deps = await startupDeps({
    codeExecution: "remote",
    provider,
    scopes: ["integrations"],
  });
  expect(deps.toolSelection.toolNames).not.toContain("run_code");
  expect(deps.codeSandbox).toBeNull();
  expect(deps.systemPrompt).toContain("You cannot run shell commands");
});

test("code execution disabled leaves run_code off even with the scope", async () => {
  const deps = await startupDeps({
    codeExecution: "disabled",
    provider: "openai-codex",
    scopes: ["code-run"],
  });
  expect(deps.toolSelection.toolNames).not.toContain("run_code");
  expect(deps.codeSandbox).toBeNull();
  expect(deps.systemPrompt).toContain("You cannot run shell commands");
});

test("a turn with no grant at all never gets the tool", async () => {
  const deps = await startupDeps({
    codeExecution: "remote",
    provider: "openai-codex",
    scopes: null,
  });
  expect(deps.codeSandbox).toBeNull();
});

test("HOUSTON_CODE_EXECUTION=remote needs no sandbox URL in turn mode", async () => {
  // The gateway serves the route under the grant, so the worker is deliberately
  // given no sandbox address — requiring one would be requiring a secret it
  // must not hold. Server mode still requires it (config.test.ts).
  const deps = await startupDeps({
    codeExecution: "remote",
    provider: "openai-codex",
    scopes: ["code-run"],
  });
  expect(deps.codeSandbox?.name).toBe("run_code");
});

test("the run_code budget belongs to the WORKER, not to one turn", async () => {
  // makeRunCodeTool is called per turn here, so a limiter built beside the tool
  // would reset every turn and cap nothing on a worker serving turns back to
  // back. One module-level limiter is what makes the env vars a real budget.
  const startup = await loadStartup("remote", {
    HOUSTON_RUN_CODE_MAX_CONCURRENT: "1",
  });
  const pending: { release: (() => void) | null } = { release: null };
  const held: SandboxFetch = () =>
    new Promise<Response>((resolve) => {
      pending.release = () => resolve(Response.json({}));
    });
  const first = await startTurnOn(startup, {
    provider: "openai-codex",
    scopes: ["code-run"],
    call: held,
  });
  const second = await startTurnOn(startup, {
    provider: "openai-codex",
    scopes: ["code-run"],
  });
  const run = (deps: TurnBackendDeps, id: string) =>
    deps.codeSandbox?.execute(
      id,
      { language: "bash", code: "echo hi" },
      undefined,
      undefined,
      {} as unknown as ExtensionContext,
    );
  const inFlight = run(first, "r1");
  await new Promise((r) => setTimeout(r, 10));
  await expect(run(second, "r2")).rejects.toThrow(/code-execution budget/);
  pending.release?.();
  await inFlight;
});

test("vm mode starts the turn's VM booting at startup, only when the turn may run code", async () => {
  const startup = await loadStartup("vm");
  const granted = vi.fn();
  const deps = await startTurnOn(startup, {
    provider: "openai-codex",
    scopes: ["code-run"],
    warmCode: granted,
  });
  expect(deps.codeSandbox?.name).toBe("run_code");
  expect(granted).toHaveBeenCalledTimes(1);
  const withheld = vi.fn();
  await startTurnOn(startup, {
    provider: "openai-codex",
    scopes: ["integrations"],
    warmCode: withheld,
  });
  expect(withheld).not.toHaveBeenCalled();
});
