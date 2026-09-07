/**
 * Slice freshness for the cross-agent conversation sweep: the guard against
 * the sweep-vs-patch race.
 *
 * The `all-conversations` aggregate is written by two hands. The SWEEP
 * (`hooks/queries/use-conversations.ts`) fans out one read per agent and
 * writes the whole board when the LAST agent answers. The push-event PATCH
 * (`hooks/use-agent-invalidation.ts`) rewrites ONE agent's slice the moment
 * that agent emits. The sweep's reads are taken at its start, but its write
 * lands at its end, and one slow agent holds that end open for the whole
 * transport wake budget (~15s for a pod that only ever answers 503, minutes
 * for a real cold start). Every slice patched in between is then overwritten
 * by the sweep's older snapshot. Observed shape: a mission created and
 * answered during the hold vanished from the board seven seconds after its
 * reply, and with it the open chat (the panel keys its feed off the selected
 * card), while the waking toast for the slow agent covered the composer.
 *
 * The guard is bookkeeping, not ordering: each patch stamps its agent, the
 * sweep remembers when it started, and on settle every agent patched since is
 * folded exactly like an agent that failed to answer, so its cached slice
 * (the newer one) is carried forward and the sweep's stale rows for it are
 * dropped ({@link foldSweep}). Dependency-free so `node --test` exercises it;
 * the wiring imports the shared {@link sliceFreshness} instance.
 */

import {
  type AgentScopedRow,
  mergePartialSweep,
} from "./all-conversations-recovery.ts";

export interface SliceFreshness {
  /** A push-event patch is rewriting this agent's slice from a read taken at
   *  `at` (epoch ms). Stamped at the READ, not the write, so a sweep that
   *  started between the two still counts the patch as newer. */
  notePatched(agentPath: string, at: number): void;
  /** The agents among `agentPaths` whose slice was patched at or after
   *  `since` (epoch ms). Same-millisecond ties count as patched: the patch's
   *  rows are fresh either way, the sweep's may not be. */
  patchedSince(agentPaths: readonly string[], since: number): string[];
}

export function createSliceFreshness(): SliceFreshness {
  const patchedAt = new Map<string, number>();
  return {
    notePatched(agentPath, at) {
      patchedAt.set(agentPath, Math.max(patchedAt.get(agentPath) ?? 0, at));
    },
    patchedSince(agentPaths, since) {
      return agentPaths.filter((p) => (patchedAt.get(p) ?? -1) >= since);
    },
  };
}

/** The app-wide instance: one aggregate, one ledger. */
export const sliceFreshness: SliceFreshness = createSliceFreshness();

/**
 * Fold a settled sweep into the cache. Fresh rows win for every agent that
 * answered AND was not overtaken by a patch; the cached slice is carried
 * forward for the agents that failed ({@link mergePartialSweep}) and for the
 * overtaken ones, whose sweep rows are dropped as the older snapshot.
 *
 * With no cache to carry from (`previous` undefined: the first sweep of a
 * session) the overtaken list is ignored rather than dropping those agents'
 * only rows. An EMPTY cache is a real state (a patch may have emptied the
 * slice) and is honored.
 */
export function foldSweep<T extends AgentScopedRow>(
  fresh: T[],
  previous: T[] | undefined,
  failedAgentPaths: readonly string[],
  overtakenAgentPaths: readonly string[],
): T[] {
  if (overtakenAgentPaths.length === 0 || previous === undefined) {
    return mergePartialSweep(fresh, previous, failedAgentPaths);
  }
  const overtaken = new Set(overtakenAgentPaths);
  const kept = fresh.filter((row) => !overtaken.has(row.agent_path));
  const carried = previous.filter((row) => overtaken.has(row.agent_path));
  return mergePartialSweep([...kept, ...carried], previous, failedAgentPaths);
}
