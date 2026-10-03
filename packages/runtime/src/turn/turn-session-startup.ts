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
import { turnRunCodeLimiter } from "./turn-run-code-limiter";
import { createTurnModelRuntime } from "./turn-runtime";
import { TURN_CODE_RUN_PATH } from "./turn-sandbox-code";
import type { TurnDirectories, TurnSessionRequest } from "./turn-session";
import { turnSharedSkillsDir } from "./turn-shared-skills";
import { turnSystemPrompt } from "./turn-system-prompt";
import { buildTurnToolSelection, turnCodeExecution } from "./turn-toolset";

export interface RunTurnDeps {
  claudeSdk?: ClaudeBackendDeps["sdk"];
  /** Test seam: replaces the turn's own title runner (turn-mission-title.ts). */
  titleRunner?: MissionTitleRunner;
  createBackend?: (provider: string, deps: TurnBackendDeps) => HarnessBackend;
  createModelRuntime?: typeof createTurnModelRuntime;
  /** Test seam: the stall window, else `config.turnStallTimeoutMs`. */
  stallTimeoutMs?: number;
  /** Test seam: the first-byte deadline, else `config.turnFirstByteDeadlineMs`. */
  firstByteDeadlineMs?: number;
}

export interface TurnSessionStartup {
  backend: HarnessBackend;
  model: Awaited<ReturnType<typeof createTurnModelRuntime>>["model"];
  /** The turn's own model runtime (per-request auth), reused by its title. */
  modelRuntime: Awaited<
    ReturnType<typeof createTurnModelRuntime>
  >["modelRuntime"];
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
  // ONE answer for the allowlist, the tool and the prompt: whatever the grant
  // withheld must be missing from all three, or the model is told it can run
  // code it has no tool for.
  const codeExecution = turnCodeExecution(
    turn,
    turnCodeExecutionMode(config.codeExecution, config.poolSingleUse),
  );
  const toolSelection = buildTurnToolSelection(turn, codeExecution);
  // The code VM's ~4 s boot starts now, behind model setup and the first
  // model call. A turn without run_code never boots one.
  if (toolSelection.includeRunCode) turn.sandbox?.warmCode?.();
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
  // The worker holds no sandbox URL, app token or GCP identity: the call rides
  // this turn's sandbox facade, which relays it under the grant or, in `vm`
  // mode, runs it in the turn's own micro-VM.
  const codeSandbox =
    toolSelection.includeRunCode && turn.sandbox
      ? makeRunCodeTool({
          transport: sandboxFetchRunCodeTransport({
            call: turn.sandbox.call,
            path: TURN_CODE_RUN_PATH,
          }),
          workspaceDir: directories.workspaceDir,
          limiter: turnRunCodeLimiter,
        })
      : null;
  const backend = (deps.createBackend ?? createTurnBackend)(turn.provider, {
    directories,
    turn,
    modelRuntime,
    toolSelection,
    codeSandbox,
    systemPrompt: config.systemPrompt || turnSystemPrompt(codeExecution),
    // The ROLE's file wall, the same policy the long-lived runtime builds
    // (session-tools.ts): a coordinator turn is held to its memory document,
    // so the shared skills mirror it must never rewrite is not a writable root
    // for it on any provider.
    fileGuard: fileToolGuardOptions({
      role: turn.role ?? null,
      workspaceDir: directories.workspaceDir,
      sharedSkillsDir: config.sharedSkillsDir,
      sharedSkillsSnapshot: turnSharedSkillsDir(directories.turnRoot),
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
