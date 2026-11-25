import type { AgentId } from "../domain/types";
import type { Running, RuntimeHandle } from "./process-types";

export const DEFAULT_SHUTDOWN_DRAIN_MS = 5_000;

// WHY: Throw if the child outlives SIGKILL; a rename would move its live dir (Windows locks cwd). ADR-0016
export async function drainUntilExit(
  running: Map<AgentId, Running>,
  agentId: AgentId,
  r: Running,
  timeoutMs: number,
  forceTimeoutMs: number,
): Promise<void> {
  const exited = new Promise<boolean>((resolve) =>
    r.handle.onExit?.(() => resolve(true)),
  );
  const expire = (ms: number) =>
    new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), ms);
      timer.unref?.();
    });
  r.stopRequested = true;
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
  if (running.get(agentId) === r) running.delete(agentId);
}

export async function shutdownAllAndWait(
  running: Map<AgentId, Running>,
  timeoutMs = DEFAULT_SHUTDOWN_DRAIN_MS,
  forceTimeoutMs = 2_000,
): Promise<void> {
  const draining: { handle: RuntimeHandle; exited: Promise<void> }[] = [];
  for (const r of running.values()) {
    const { onExit } = r.handle;
    if (onExit) {
      draining.push({
        handle: r.handle,
        exited: new Promise<void>((resolve) => onExit(() => resolve())),
      });
    }
    r.stopRequested = true;
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
  for (const d of draining) d.handle.forceKill?.();
  await Promise.race([allExited, expire(forceTimeoutMs)]);
}
