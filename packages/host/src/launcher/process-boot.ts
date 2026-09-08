import type { Agent, AgentId } from "../domain/types";
import { LauncherClosedError, type RuntimeEndpoint } from "../ports";
import type { ProcessLauncherOptions, Running } from "./process-types";

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
  // Re-check the latch after the first await: a boot that entered before
  // hold() was acquired is invisible to sleep() until the running entry
  // exists (set synchronously below), so this port-allocation gap was the
  // one window where a rename's quiesce could miss a runtime entirely and
  // let it come up bound to the old directory mid-move.
  if (state.held(agent.id))
    throw new Error(
      `agent '${agent.id}' is being renamed - retry with its new id`,
    );
  // Same gap for shutdown: a boot that entered before shutdownAll* ran is
  // not in the live-set yet, so its child would be spawned AFTER the sweep
  // that kills everything - an orphan by construction.
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
  // Reap a crashed runtime from the live-set: without this a process that
  // dies on its own (OOM, panic) lingers as a phantom "running" entry and
  // ensureAwake keeps handing its dead port to every turn. Only evict if the
  // map still points at THIS handle - a sleep()+respawn must not be clobbered.
  // The SAME (single) registration also aborts a boot in flight: a child that
  // dies mid-boot fails the caller NOW instead of polling a dead port until
  // the health budget runs out.
  let abortBoot: ((err: Error) => void) | undefined;
  handle.onExit?.(() => {
    if (state.running.get(agent.id) === entry) state.running.delete(agent.id);
    abortBoot?.(new Error("runtime exited before becoming healthy"));
  });
  try {
    // The raced rejection is always observed - race() subscribes to both
    // promises up front - so an exit after settle can't surface as an
    // unhandled rejection (and clearing abortBoot below stops it firing at all).
    await Promise.race([
      state.waitHealthy(handle.port, token),
      new Promise<never>((_, reject) => {
        abortBoot = reject;
      }),
    ]);
  } catch (err) {
    // A runtime that never came up must not linger as a zombie nor be cached
    // as "running" - kill it and surface the failure (the turn errors visibly).
    handle.kill();
    state.running.delete(agent.id);
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
