import type {
  NewRoutine,
  Routine,
  RoutineUpdate,
} from "@houston/engine-adapter";
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "../../lib/query-keys";
import {
  patchRoutineList,
  replaceRoutineInList,
} from "../../lib/routine-optimistic";
import { tauriRoutines } from "../../lib/tauri";

/**
 * ONE agent's routines query, as options. Both the open routine's chat
 * (`useRoutines`) and the employee's Routines list build from this, so they
 * share the key, the cache entry and the queryFn: the routines event
 * invalidation (`use-agent-invalidation.ts` → `queryKeys.routines(path)`)
 * refreshes both, and neither can serve a different truth than the other.
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

/**
 * What a routine WRITE leaves behind: that agent's routines list refetched.
 * The host reschedules on the write itself. Shared by `useCreateRoutine` and
 * the any-agent writes so the two can never drift apart on what a write
 * invalidates.
 */
function afterRoutineWrite(qc: QueryClient, agentPath: string): void {
  qc.invalidateQueries({ queryKey: queryKeys.routines(agentPath) });
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

/** A routine write aimed at an agent chosen per call, not per mount. */
export interface RoutineWriteFor {
  agentPath: string;
  routineId: string;
}

/**
 * The four routine writes a routine ROW can trigger (edit, delete, run now,
 * cancel a run), with the AGENT in the variables instead of in the hook
 * argument, so one binding serves whichever agent a call names (the routine
 * screen, its model selector and the Routines list). Same `call()` toast path and the same invalidation helpers
 * (`afterRoutineWrite` / `afterRunWrite`) as `useCreateRoutine` above.
 */
export function useRoutineWritesForAnyAgent() {
  const qc = useQueryClient();
  // Optimistic (PRODUCT-1706): the row and the screen paint the edit the
  // instant it is sent. On the hosted profile a write can take seconds (the
  // agent's pod may have to wake first), and painting the OLD schedule for
  // that window made a saved time look ignored. The host's applied routine
  // replaces the guess when it lands; a rejected write rolls the cache back
  // and refetches, and the caller's onError shows the authored toast.
  const update = useMutation({
    mutationFn: ({
      agentPath,
      routineId,
      updates,
    }: RoutineWriteFor & { updates: RoutineUpdate }) =>
      tauriRoutines.update(agentPath, routineId, updates),
    onMutate: async ({ agentPath, routineId, updates }) => {
      const key = queryKeys.routines(agentPath);
      // An in-flight refetch would overwrite the optimistic row with the
      // pre-edit truth the moment it lands.
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Routine[]>(key);
      qc.setQueryData<Routine[]>(key, (list) =>
        patchRoutineList(list, routineId, updates, new Date().toISOString()),
      );
      return { previous };
    },
    onError: (_err, { agentPath }, context) => {
      const key = queryKeys.routines(agentPath);
      if (context?.previous) qc.setQueryData(key, context.previous);
      qc.invalidateQueries({ queryKey: key });
    },
    onSuccess: (routine, { agentPath }) => {
      qc.setQueryData<Routine[]>(queryKeys.routines(agentPath), (list) =>
        replaceRoutineInList(list, routine),
      );
      afterRoutineWrite(qc, agentPath);
    },
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
