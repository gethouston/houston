import type { Agent, AgentId } from "../domain/types";
import type { RuntimeExit } from "./process-types";

/**
 * A runtime child that died on its own — the host never asked it to exit.
 * Before this the launcher reaped such a child in silence: the ONLY trace of
 * a hard kill (a cgroup OOM SIGKILL, a V8 heap-limit abort) was the boot-time
 * `EngineRestartedMidTurnError` of the replacement, which knows the turn but
 * not the cause. 348 identical restarts of one routine ran through Sentry
 * without one exit code (HOUSTON-APP-5DX). The host is the one process that
 * sees the code, the signal and the last stderr lines, so it says them.
 *
 * One issue per death shape: Sentry groups by this class and the top of the
 * message (agent ids vary, the cause does not).
 */
export class RuntimeDiedError extends Error {
  constructor(
    readonly agentId: AgentId,
    readonly exit: RuntimeExit,
  ) {
    super(
      `runtime died unrequested: ${describeExit(exit)} agent=${agentId}${exit.stderrTail.length > 0 ? `\nlast stderr:\n${exit.stderrTail.join("\n")}` : ""}`,
    );
    this.name = "RuntimeDiedError";
  }
}

/**
 * `code=<n> signal=<sig> (<reading>)`. The reading names what the shape
 * usually means on a managed pod; the raw fields stay so nobody has to trust
 * it.
 */
export function describeExit(exit: RuntimeExit): string {
  return `code=${exit.code ?? "none"} signal=${exit.signal ?? "none"} (${readExit(exit)})`;
}

function readExit(exit: RuntimeExit): string {
  if (exit.signal === "SIGKILL")
    return "killed: cgroup OOM or an external kill";
  if (exit.signal === "SIGABRT" || exit.code === 134)
    return "aborted: a V8 fatal error such as the heap limit";
  if (exit.signal === "SIGSEGV") return "segfault";
  if (exit.signal !== null) return `signal ${exit.signal}`;
  if (exit.code === 1)
    return "exited 1: an uncaught exception the runtime logged";
  if (exit.code === 0) return "exited 0: the runtime shut itself down";
  if (exit.code === null) return "never spawned or the spawn errored";
  return `exited ${exit.code}`;
}

/** Default death reporter: one console.error the host's Sentry capture feed
 *  turns into an exception event (the log line rides as `log_message`). */
export function reportRuntimeDeath(agent: Agent, exit: RuntimeExit): void {
  console.error(
    `[launcher] runtime for '${agent.id}' died unrequested: ${describeExit(exit)}`,
    new RuntimeDiedError(agent.id, exit),
  );
}
