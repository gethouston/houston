import {
  type AgentScopedRow,
  mergePartialSweep,
} from "./all-conversations-recovery.ts";

export interface SliceFreshness {
  notePatched(agentPath: string, at: number): void;
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

export const sliceFreshness: SliceFreshness = createSliceFreshness();

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
