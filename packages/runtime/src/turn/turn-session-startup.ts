import type { ClaudeBackendDeps } from "../backends/claude/backend";
import { preloadClaudeSdk } from "../backends/claude/sdk-loader";
import type { HarnessBackend } from "../backends/types";
import { config } from "../config";
import { fileToolGuardOptions } from "../session/coordinator-policy";
import type { MissionTitleRunner } from "../session/mission-title";
import { turnCodeExecutionMode } from "../session/tool-selection";
import { makeRunCodeTool } from "../session/tools/run-code";
import { sandboxFetchRunCodeTransport } from "../session/tools/run-code-transport";
import { createTurnBackend, type TurnBackendDeps } from "./turn-backend";
import { claimedTurnKeepsWrite } from "./turn-filesystem-scope";
import { turnMissionGuidance } from "./turn-mission-tools";
import { turnRunCodeLimiter } from "./turn-run-code-limiter";
import { createTurnModelRuntime } from "./turn-runtime";
import { TURN_CODE_RUN_PATH } from "./turn-sandbox-code";
import type { TurnDirectories, TurnSessionRequest } from "./turn-session";
import { turnSharedSkillsDir } from "./turn-shared-skills";
import { turnSystemPrompt } from "./turn-system-prompt";
import { buildTurnToolSelection, turnCodeExecution } from "./turn-toolset";

export interface RunTurnDeps {
  claudeSdk?: ClaudeBackendDeps["sdk"];
  titleRunner?: MissionTitleRunner;
  createBackend?: (provider: string, deps: TurnBackendDeps) => HarnessBackend;
  createModelRuntime?: typeof createTurnModelRuntime;
  stallTimeoutMs?: number;
  firstByteDeadlineMs?: number;
}

export interface TurnSessionStartup {
  backend: HarnessBackend;
  model: Awaited<ReturnType<typeof createTurnModelRuntime>>["model"];
  modelRuntime: Awaited<
    ReturnType<typeof createTurnModelRuntime>
  >["modelRuntime"];
}

export type TurnSessionStartupTask = Promise<
  { ok: true; startup: TurnSessionStartup } | { ok: false; error: unknown }
>;

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
  const codeExecution = turnCodeExecution(
    turn,
    turnCodeExecutionMode(config.codeExecution, config.poolSingleUse),
  );
  const sdkLoad =
    turn.provider === "anthropic"
      ? preloadClaudeSdk(deps.claudeSdk).then((result) => {
          if (turn.timings) turn.timings.t_backend_loaded = performance.now();
          return result;
        })
      : undefined;
  const createRuntime = deps.createModelRuntime ?? createTurnModelRuntime;
  const [{ modelRuntime, model }, missions] = await Promise.all([
    createRuntime(
      directories.dataDir,
      turn.provider,
      turn.pin?.model,
      turn.timings,
    ),
    turnMissionGuidance(turn),
  ]);
  const toolSelection = buildTurnToolSelection(turn, codeExecution);
  if (sdkLoad) await sdkLoad;
  const keepsWrite = claimedTurnKeepsWrite(directories, turn);
  const codeSandbox =
    toolSelection.includeRunCode && turn.sandbox
      ? makeRunCodeTool({
          transport: sandboxFetchRunCodeTransport({
            call: turn.sandbox.call,
            path: TURN_CODE_RUN_PATH,
          }),
          workspaceDir: directories.workspaceDir,
          limiter: turnRunCodeLimiter,
          ...(keepsWrite ? { keepsWrite } : {}),
        })
      : null;
  const backend = (deps.createBackend ?? createTurnBackend)(turn.provider, {
    directories,
    turn,
    modelRuntime,
    toolSelection,
    codeSandbox,
    systemPrompt:
      config.systemPrompt || turnSystemPrompt(codeExecution, missions),
    fileGuard: fileToolGuardOptions({
      role: turn.role ?? null,
      workspaceDir: directories.workspaceDir,
      sharedSkillsDir: config.sharedSkillsDir,
      sharedSkillsSnapshot: turnSharedSkillsDir(directories.turnRoot),
      ...(keepsWrite ? { keepsWrite } : {}),
    }),
    claudeSdk: deps.claudeSdk,
    claudeSdkLoad: sdkLoad,
  });
  if (turn.timings) turn.timings.t_backend_created = performance.now();
  return { backend, model, modelRuntime };
}

export async function finishTurnSessionStartup(
  task: TurnSessionStartupTask,
): Promise<TurnSessionStartup> {
  const result = await task;
  if (!result.ok) throw result.error;
  return result.startup;
}

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
