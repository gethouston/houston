import type { NewRoutine, RoutineUpdate } from "@houston-ai/engine-client";
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import { tauriRoutines } from "../../lib/tauri";

/**
 * ONE agent's routines query, as options. Both the per-agent Routines tab
 * (`useRoutines`) and the team's cross-agent list (a `useQueries` fan-out over
 * the team's agents) build from this, so they share the key, the cache entry
 * and the queryFn — the routines event invalidation
 * (`use-agent-invalidation.ts` → `queryKeys.routines(path)`) refreshes both,
 * and neither can serve a different truth than the other. A fan-out that minted
 * its own aggregate key would be a second source of that truth, and a second
 * cross-agent read to keep warm.
 */
export function routinesQueryOptions(agentPath: string) {
  return {
    queryKey: queryKeys.routines(agentPath),
    queryFn: () => tauriRoutines.list(agentPath),
    staleTime: 30_000,
  };
}

/** One agent's routine RUNS, as options — the sibling of
 *  {@link routinesQueryOptions} for the same reason. */
export function routineRunsQueryOptions(agentPath: string) {
  return {
    queryKey: queryKeys.routineRuns(agentPath),
    queryFn: () => tauriRoutines.listRuns(agentPath),
    staleTime: 30_000,
  };
}

export function useRoutines(agentPath: string | undefined) {
  return useQuery({
    ...routinesQueryOptions(agentPath ?? ""),
    enabled: !!agentPath,
  });
}

export function useRoutineRuns(
  agentPath: string | undefined,
  routineId?: string,
) {
  return useQuery({
    queryKey: queryKeys.routineRuns(agentPath ?? "", routineId),
    queryFn: () => {
      if (!agentPath) throw new Error("agentPath required");
      return tauriRoutines.listRuns(agentPath, routineId);
    },
    enabled: !!agentPath,
    staleTime: 30_000,
  });
}

/**
 * What a routine WRITE leaves behind: that agent's routines list refetched, and
 * the scheduler resynced. The engine syncs on write already, but a redundant
 * client-side sync is cheap and protects against race-y reads after WS
 * reconnects. Shared by the per-agent hooks and the cross-agent ones so the two
 * can never drift apart on what a write invalidates.
 */
function afterRoutineWrite(qc: QueryClient, agentPath: string): void {
  qc.invalidateQueries({ queryKey: queryKeys.routines(agentPath) });
  tauriRoutines.syncScheduler(agentPath).catch(console.error);
}

/** What a RUN write leaves behind: that agent's run list refetched. */
function afterRunWrite(qc: QueryClient, agentPath: string): void {
  qc.invalidateQueries({ queryKey: queryKeys.routineRuns(agentPath) });
}

export function useCreateRoutine(agentPath: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewRoutine) => tauriRoutines.create(agentPath, input),
    onSuccess: () => afterRoutineWrite(qc, agentPath),
  });
}

export function useUpdateRoutine(agentPath: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      routineId,
      updates,
    }: {
      routineId: string;
      updates: RoutineUpdate;
    }) => tauriRoutines.update(agentPath, routineId, updates),
    onSuccess: () => afterRoutineWrite(qc, agentPath),
  });
}

export function useDeleteRoutine(agentPath: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (routineId: string) =>
      tauriRoutines.delete(agentPath, routineId),
    onSuccess: () => afterRoutineWrite(qc, agentPath),
  });
}

export function useRunRoutineNow(agentPath: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (routineId: string) =>
      tauriRoutines.runNow(agentPath, routineId),
    onSuccess: () => afterRunWrite(qc, agentPath),
  });
}

export function useCancelRoutineRun(agentPath: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ routineId, runId }: { routineId: string; runId: string }) =>
      tauriRoutines.cancelRun(agentPath, routineId, runId),
    onSuccess: () => afterRunWrite(qc, agentPath),
  });
}

/** A routine write aimed at an agent chosen per call, not per mount. */
export interface RoutineWriteFor {
  agentPath: string;
  routineId: string;
}

/**
 * The same four routine writes, with the AGENT in the variables instead of in
 * the hook argument. A cross-agent list (a team's Routines) knows which agent a
 * row belongs to only when the row is acted on, and hooks may not be called in
 * a loop over a roster that changes — so it binds these once and names the
 * owner per call. Same routes, same `call()` toast path, same invalidation
 * (`afterRoutineWrite` / `afterRunWrite`) as the per-agent hooks above.
 */
export function useRoutineWritesForAnyAgent() {
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: ({
      agentPath,
      routineId,
      updates,
    }: RoutineWriteFor & { updates: RoutineUpdate }) =>
      tauriRoutines.update(agentPath, routineId, updates),
    onSuccess: (_r, { agentPath }) => afterRoutineWrite(qc, agentPath),
  });
  const remove = useMutation({
    mutationFn: ({ agentPath, routineId }: RoutineWriteFor) =>
      tauriRoutines.delete(agentPath, routineId),
    onSuccess: (_r, { agentPath }) => afterRoutineWrite(qc, agentPath),
  });
  const runNow = useMutation({
    mutationFn: ({ agentPath, routineId }: RoutineWriteFor) =>
      tauriRoutines.runNow(agentPath, routineId),
    onSuccess: (_r, { agentPath }) => afterRunWrite(qc, agentPath),
  });
  const cancelRun = useMutation({
    mutationFn: ({
      agentPath,
      routineId,
      runId,
    }: RoutineWriteFor & { runId: string }) =>
      tauriRoutines.cancelRun(agentPath, routineId, runId),
    onSuccess: (_r, { agentPath }) => afterRunWrite(qc, agentPath),
  });
  return { update, remove, runNow, cancelRun };
}
