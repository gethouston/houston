import type { ProvisioningEntry } from "./entry.ts";

export type AgentWarmup = "ready" | "warming" | "stalled";

export const SLOW_START_MS = 5_500 + 3_000;

export function warmingEntryFor(
  entries: Iterable<ProvisioningEntry>,
  agentPath: string,
): ProvisioningEntry | undefined {
  for (const entry of entries) {
    if (entry.agentPath === agentPath) return entry;
  }
  return undefined;
}

export function warmupAt(
  entry: Pick<ProvisioningEntry, "since" | "timedOut"> | undefined,
  now: number,
): AgentWarmup {
  if (!entry) return "ready";
  if (entry.timedOut || now - entry.since >= SLOW_START_MS) return "stalled";
  return "warming";
}

export function agentWarmup(
  entries: Iterable<ProvisioningEntry>,
  agentPath: string,
  now: number,
): AgentWarmup {
  return warmupAt(warmingEntryFor(entries, agentPath), now);
}
