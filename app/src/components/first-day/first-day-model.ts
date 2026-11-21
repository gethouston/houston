import type { Config } from "../../data/config";
import { isFirstDayPending } from "../../lib/agent-first-day-model";

export type FirstDayPlacement<A> =
  | { kind: "none" }
  | { kind: "hero"; agent: A }
  | { kind: "compact"; agent: A }
  | { kind: "banner"; agents: A[] };

export function pendingFirstDayAgents<A extends { folderPath: string }>(
  agents: readonly A[],
  configFor: (folderPath: string) => Config | undefined,
  canStart: (agent: A) => boolean,
): A[] {
  return agents.filter(
    (agent) =>
      canStart(agent) && isFirstDayPending(configFor(agent.folderPath)),
  );
}

export function firstDayPlacement<A extends { folderPath: string }>({
  pinnedAgent,
  pending,
  pinnedTaskCount,
}: {
  pinnedAgent: A | null;
  pending: readonly A[];
  pinnedTaskCount: number;
}): FirstDayPlacement<A> {
  if (pinnedAgent) {
    const waiting = pending.some(
      (agent) => agent.folderPath === pinnedAgent.folderPath,
    );
    if (!waiting) return { kind: "none" };
    return pinnedTaskCount === 0
      ? { kind: "hero", agent: pinnedAgent }
      : { kind: "compact", agent: pinnedAgent };
  }
  return pending.length > 0
    ? { kind: "banner", agents: [...pending] }
    : { kind: "none" };
}

export function firstDayConfigsSettled({
  capabilitiesLoading,
  configsPending,
  anyCreating,
}: {
  capabilitiesLoading: boolean;
  configsPending: boolean;
  anyCreating: boolean;
}): boolean {
  return !capabilitiesLoading && !configsPending && !anyCreating;
}

export function firstDayHoldsAutoOpen<A>(
  settled: boolean,
  placement: FirstDayPlacement<A>,
): boolean {
  return !settled || placement.kind !== "none";
}
