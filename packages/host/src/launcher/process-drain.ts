import type { AgentId } from "../domain/types";
import type { Running, RuntimeHandle } from "./process-types";

/**
 * Kill the child and wait for it to ACTUALLY be gone: callers sleep an
 * agent to get its directory quiet (a rename is about to move it; on
 * Windows a live child's cwd even locks it), and SIGTERM alone resolves
 * while the process is still flushing. A child that outlives the SIGTERM
 * budget (wedged drain, blocked event loop) is SIGKILLed; one that
 * survives even that fails the sleep LOUDLY - resolving silently here is
 * what let a rename proceed under a live runtime, whose next write
 * resurrected the old-named directory (HOU-827). The live-set entry is
 * removed only once the exit is confirmed, so status() stays truthful for
 * the whole drain.
 */
export async function drainUntilExit(
  running: Map<AgentId, Running>,
  agentId: AgentId,
  r: Running,
  timeoutMs: number,
  forceTimeoutMs: number,
): Promise<void> {
  // Subscribe BEFORE killing so a fast exit cannot be missed.
  const exited = new Promise<boolean>((resolve) =>
    r.handle.onExit?.(() => resolve(true)),
  );
  const expire = (ms: number) =>
    new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), ms);
      timer.unref?.();
    });
  r.handle.kill();
  let gone = await Promise.race([exited, expire(timeoutMs)]);
  if (!gone) {
    r.handle.forceKill?.();
    gone = await Promise.race([exited, expire(forceTimeoutMs)]);
  }
  if (!gone)
    throw new Error(
      `runtime for '${agentId}' is still alive after SIGTERM and SIGKILL - refusing to report it asleep`,
    );
  // The crash reaper (onExit in spawnUntilHealthy) usually got here first;
  // guard against clobbering a respawn that raced in after it.
  if (running.get(agentId) === r) running.delete(agentId);
}

/**
 * shutdownAll, but resolved only once every child has ACTUALLY exited. The
 * store-sync stop path needs this: a final /data sync taken while a child
 * is still flushing its last conversation write would persist a torn file
 * as the agent's durable state.
 *
 * SIGTERM lets each runtime DRAIN - finish the turns it holds, refuse new
 * ones - for up to `timeoutMs` (the host's drain budget: a managed pod's
 * termination grace minus what the final sync needs; the desktop's short
 * default). A child still alive past that is SIGKILLed and given
 * `forceTimeoutMs` more; the sync then proceeds regardless, because the
 * alternative (kubelet's SIGKILL of the whole pod) loses the sync too.
 * Handles without onExit (test stubs) count as already exited.
 */
export async function shutdownAllAndWait(
  running: Map<AgentId, Running>,
  timeoutMs = 5_000,
  forceTimeoutMs = 2_000,
): Promise<void> {
  // Latch FIRST: from here on ensureAwake refuses (LauncherClosedError)
  // instead of respawning into the drain window below.
  const draining: { handle: RuntimeHandle; exited: Promise<void> }[] = [];
  for (const r of running.values()) {
    const { onExit } = r.handle;
    if (onExit) {
      draining.push({
        handle: r.handle,
        exited: new Promise<void>((resolve) => onExit(() => resolve())),
      });
    }
    r.handle.kill();
  }
  running.clear();
  if (draining.length === 0) return;
  const expire = (ms: number) =>
    new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), ms);
      timer.unref?.();
    });
  const allExited = Promise.all(draining.map((d) => d.exited)).then(() => true);
  if (await Promise.race([allExited, expire(timeoutMs)])) return;
  // Past the drain budget: whatever is still alive gets no more time.
  for (const d of draining) d.handle.forceKill?.();
  await Promise.race([allExited, expire(forceTimeoutMs)]);
}
