import type { ClaudeBackendDeps } from "../backends/claude/backend";
import { preloadClaudeSdk } from "../backends/claude/sdk-loader";
import type { HarnessBackend } from "../backends/types";
import { config } from "../config";
import { SYSTEM_PROMPT } from "../session/resource-loader";
import { turnCodeExecutionMode } from "../session/tool-selection";
import { makeIdTokenProvider } from "../session/tools/gcp-id-token";
import { makeRunCodeTool } from "../session/tools/run-code";
import { createTurnBackend, type TurnBackendDeps } from "./turn-backend";
import { createTurnModelRuntime } from "./turn-runtime";
import type { TurnDirectories, TurnSessionRequest } from "./turn-session";
import { buildTurnToolSelection } from "./turn-toolset";

export interface RunTurnDeps {
  claudeSdk?: ClaudeBackendDeps["sdk"];
  createBackend?: (provider: string, deps: TurnBackendDeps) => HarnessBackend;
  createModelRuntime?: typeof createTurnModelRuntime;
}

export interface TurnSessionStartup {
  backend: HarnessBackend;
  model: Awaited<ReturnType<typeof createTurnModelRuntime>>["model"];
}

export type TurnSessionStartupTask = Promise<
  { ok: true; startup: TurnSessionStartup } | { ok: false; error: unknown }
>;

/** Start model setup, the Claude SDK import, and backend construction. */
export function startTurnSession(
  directories: TurnDirectories,
  turn: TurnSessionRequest,
  deps: RunTurnDeps = {},
): TurnSessionStartupTask {
  return prepareTurnSession(directories, turn, deps).then(
    (startup) => ({ ok: true, startup }),
    (error: unknown) => ({ ok: false, error }),
  );
}

async function prepareTurnSession(
  directories: TurnDirectories,
  turn: TurnSessionRequest,
  deps: RunTurnDeps,
): Promise<TurnSessionStartup> {
  const sdkLoad =
    turn.provider === "anthropic"
      ? preloadClaudeSdk(deps.claudeSdk).then((result) => {
          if (turn.timings) turn.timings.t_backend_loaded = performance.now();
          return result;
        })
      : undefined;
  const createRuntime = deps.createModelRuntime ?? createTurnModelRuntime;
  const { modelRuntime, model } = await createRuntime(
    directories.dataDir,
    turn.provider,
    turn.pin?.model,
    turn.timings,
  );
  if (sdkLoad) await sdkLoad;
  const toolSelection = buildTurnToolSelection(
    turn,
    turnCodeExecutionMode(config.codeExecution, config.poolSingleUse),
  );
  const codeSandbox = toolSelection.includeRunCode
    ? makeRunCodeTool({
        baseUrl: config.codeSandboxUrl,
        token: config.codeSandboxToken,
        workspaceDir: directories.workspaceDir,
        limits: {
          maxConcurrent: config.runCodeMaxConcurrent,
          maxPerMinute: config.runCodePerMinute,
        },
        idToken: makeIdTokenProvider(config.codeSandboxUrl),
      })
    : null;
  const backend = (deps.createBackend ?? createTurnBackend)(turn.provider, {
    directories,
    turn,
    modelRuntime,
    toolSelection,
    codeSandbox,
    systemPrompt: config.systemPrompt || SYSTEM_PROMPT,
    sharedRoots: config.sharedSkillsDir ? [config.sharedSkillsDir] : [],
    claudeSdk: deps.claudeSdk,
    claudeSdkLoad: sdkLoad,
  });
  if (turn.timings) turn.timings.t_backend_created = performance.now();
  return { backend, model };
}

export async function finishTurnSessionStartup(
  task: TurnSessionStartupTask,
): Promise<TurnSessionStartup> {
  const result = await task;
  if (!result.ok) throw result.error;
  return result.startup;
}

/** Report setup work that failed after hydration had already doomed the turn. */
export async function reportAbandonedTurnStartup(
  task: TurnSessionStartupTask | undefined,
): Promise<void> {
  if (!task) return;
  const result = await task;
  if (result.ok) return;
  const detail =
    result.error instanceof Error
      ? `${result.error.name}: ${result.error.message}`
      : String(result.error);
  console.error(`[turn] overlapped startup failed after hydration (${detail})`);
}
