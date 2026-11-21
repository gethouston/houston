import type { Agent, AgentId } from "../domain/types";
import {
  AgentRenamingError,
  LauncherClosedError,
  type RuntimeEndpoint,
} from "../ports";
import type {
  ProcessLauncherOptions,
  Running,
  RuntimeExit,
} from "./process-types";
import { describeExit, reportRuntimeDeath } from "./runtime-death";

export interface ProcessBootState {
  opts: ProcessLauncherOptions;
  running: Map<AgentId, Running>;
  held(id: AgentId): boolean;
  closed(): boolean;
  allocatePort(): Promise<number>;
  waitHealthy(port: number, token: string): Promise<void>;
}

export async function spawnUntilHealthy(
  state: ProcessBootState,
  agent: Agent,
): Promise<RuntimeEndpoint> {
  const token = state.opts.mintToken(agent);
  const port = await state.allocatePort();
  if (state.held(agent.id)) throw new AgentRenamingError(agent.id);
  if (state.closed()) throw new LauncherClosedError();
  const cred = state.opts.credentialServing;
  const assistantRole = state.opts.assistantRoleFor?.(agent) ?? null;
  const handle = state.opts.spawner.spawn({
    workspaceDir: state.opts.workspaceDirFor(agent),
    dataDir: state.opts.dataDirFor(agent),
    ...(state.opts.sharedSkillsDirFor
      ? { sharedSkillsDir: state.opts.sharedSkillsDirFor(agent) }
      : {}),
    token,
    port,
    ...(cred
      ? {
          sandboxToken: cred.mintSandboxToken(agent),
          controlPlaneUrl: cred.controlPlaneUrl,
        }
      : {}),
    ...(assistantRole ? { assistantRole } : {}),
  });
  const entry: Running = { handle, token };
  state.running.set(agent.id, entry);
  let abortBoot: ((err: Error) => void) | undefined;
  handle.onExit?.((exit?: RuntimeExit) => {
    if (!isRuntimeExit(exit)) exit = undefined;
    const live = state.running.get(agent.id) === entry;
    const requested = entry.stopRequested === true || state.closed();
    if (live) state.running.delete(agent.id);
    if (abortBoot) {
      abortBoot(
        new Error(
          `runtime exited before becoming healthy${exit ? `: ${describeExit(exit)}` : ""}`,
        ),
      );
      return;
    }
    if (live && !requested && exit)
      (state.opts.reportDeath ?? reportRuntimeDeath)(agent, exit);
  });
  try {
    await Promise.race([
      state.waitHealthy(handle.port, token),
      new Promise<never>((_, reject) => {
        abortBoot = reject;
      }),
    ]);
  } catch (err) {
    handle.kill();
    state.running.delete(agent.id);
    if (state.closed()) throw new LauncherClosedError();
    throw err;
  } finally {
    abortBoot = undefined;
  }
  const endpoint = {
    baseUrl: `http://127.0.0.1:${handle.port}`,
    token,
  };
  try {
    await state.opts.afterSpawn?.(agent, endpoint);
  } catch (error) {
    handle.kill();
    if (state.running.get(agent.id) === entry) state.running.delete(agent.id);
    throw error;
  }
  return endpoint;
}

function isRuntimeExit(value: unknown): value is RuntimeExit {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as RuntimeExit).stderrTail)
  );
}
