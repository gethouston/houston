import type { Config } from "../../data/config";
import { isFirstDayPending } from "../../lib/agent-first-day-model";

/**
 * Where a board offers "Start {{name}}'s first day", decided from what the
 * board shows:
 *
 * - `hero`: the board is narrowed to one employee whose first day is pending
 *   and who has no tasks, so the start button IS the board.
 * - `compact`: the same employee, but tasks already exist (made by hand before
 *   the first day ran), so the offer sits above them instead of hiding them.
 * - `banner`: the whole team is in view and at least one employee waits, so
 *   the board names every one of them, each startable in one tap.
 */
export type FirstDayPlacement<A> =
  | { kind: "none" }
  | { kind: "hero"; agent: A }
  | { kind: "compact"; agent: A }
  | { kind: "banner"; agents: A[] };

/**
 * The agents whose first day waits for this user, in roster order. The first
 * day configures the employee, so only someone who may configure it (`canStart`)
 * is offered it: anyone else would press a button the gateway refuses.
 */
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
  /** The one employee the board is narrowed to, or `null` for the team. */
  pinnedAgent: A | null;
  /** The pending employees among the ones the board shows. */
  pending: readonly A[];
  /** The pinned employee's tasks, before search or person filters. */
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

/**
 * Whether every read the offer depends on is in: the capabilities (who may
 * start a first day) and each config. An employee still being created answers
 * its config with an empty placeholder, so it is not in until the warm-up ends.
 */
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

/**
 * Whether the empty board must hold its automatic "New task" composer. It
 * waits while the configs load, so a pending employee's board never flashes a
 * composer before its start button, and stays held while any start button is
 * on screen: the composer, or the "which AI Employee?" picker, would cover the
 * one thing the board is asking the user to do.
 */
export function firstDayHoldsAutoOpen<A>(
  settled: boolean,
  placement: FirstDayPlacement<A>,
): boolean {
  return !settled || placement.kind !== "none";
}
