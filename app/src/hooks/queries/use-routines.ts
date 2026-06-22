import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { NewRoutine, RoutineUpdate } from "@houston-ai/engine-client";
import { queryKeys } from "../../lib/query-keys";
import { tauriRoutines } from "../../lib/tauri";

export function useRoutines(agentPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.routines(agentPath!),
    queryFn: () => tauriRoutines.list(agentPath!),
    enabled: !!agentPath,
  });
}

export function useRoutineRuns(
  agentPath: string | undefined,
  routineId?: string,
) {
  return useQuery({
    queryKey: queryKeys.routineRuns(agentPath!, routineId),
    queryFn: () => tauriRoutines.listRuns(agentPath!, routineId),
    enabled: !!agentPath,
  });
}

export function useCreateRoutine(agentPath: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewRoutine) => tauriRoutines.create(agentPath, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.routines(agentPath) });
      // Engine syncs the scheduler on write, but a redundant client-side
      // sync is cheap and protects against race-y reads after WS reconnects.
      tauriRoutines.syncScheduler(agentPath).catch(console.error);
    },
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.routines(agentPath) });
      tauriRoutines.syncScheduler(agentPath).catch(console.error);
    },
  });
}

export function useDeleteRoutine(agentPath: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (routineId: string) =>
      tauriRoutines.delete(agentPath, routineId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.routines(agentPath) });
      tauriRoutines.syncScheduler(agentPath).catch(console.error);
    },
  });
}

export function useRunRoutineNow(agentPath: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (routineId: string) =>
      tauriRoutines.runNow(agentPath, routineId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["routine-runs", agentPath] });
    },
  });
}

export function useCancelRoutineRun(agentPath: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ routineId, runId }: { routineId: string; runId: string }) =>
      tauriRoutines.cancelRun(agentPath, routineId, runId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["routine-runs", agentPath] });
    },
  });
}
