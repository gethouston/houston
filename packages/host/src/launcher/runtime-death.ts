import type { Agent, AgentId } from "../domain/types";
import type { RuntimeExit } from "./process-types";

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

export function reportRuntimeDeath(agent: Agent, exit: RuntimeExit): void {
  console.error(
    `[launcher] runtime for '${agent.id}' died unrequested: ${describeExit(exit)}`,
    new RuntimeDiedError(agent.id, exit),
  );
}
