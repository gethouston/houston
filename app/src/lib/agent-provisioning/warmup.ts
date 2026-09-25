import type { ProvisioningEntry } from "./entry.ts";

/**
 * Where one AI Employee's engine stands: `ready` answers requests, `warming`
 * is still starting (a fresh hire, or a hosted pod waking), `stalled` is
 * still starting past its normal window.
 */
export type AgentWarmup = "ready" | "warming" | "stalled";

/** The warm-up of the AI Employee at `agentPath`, from the warming entries. */
export function agentWarmup(
  entries: Iterable<ProvisioningEntry>,
  agentPath: string,
): AgentWarmup {
  for (const entry of entries) {
    if (entry.agentPath !== agentPath) continue;
    return entry.timedOut ? "stalled" : "warming";
  }
  return "ready";
}
