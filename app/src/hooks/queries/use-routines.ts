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
import { useTranslation } from "react-i18next";
import { genericErrorDescription } from "../../lib/error-report";
import { holdPatchesAcrossRefetch } from "../../lib/optimistic-hold";
import type { OptimisticPatch } from "../../lib/optimistic-write";
import { queryKeys } from "../../lib/query-keys";
import {
  patchRoutineList,
  replaceRoutineInList,
} from "../../lib/routine-optimistic";
import { toastRoutineWriteFailure } from "../../lib/routine-write-failure";
import { tauriRoutines } from "../../lib/tauri";
import { useUIStore } from "../../stores/ui";
import {
  type RoutineWriteFor,
  useRoutineRowWrites,
} from "./use-routine-row-writes";

export type { RoutineWriteFor };

export type RoutineUpdateKind = "save" | "model";

const UPDATE_FAILURE = {
  save: { titleKey: "toasts.updateError", command: "update_routine" },
  model: { titleKey: "toasts.modelError", command: "set_routine_model" },
} as const;

export function routinesQueryOptions(agentPath: string) {
  return {
    queryKey: queryKeys.routines(agentPath),
    queryFn: () => tauriRoutines.list(agentPath),
    staleTime: 30_000,
  };
}

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

function afterRoutineWrite(qc: QueryClient, agentPath: string): void {
  qc.invalidateQueries({ queryKey: queryKeys.routines(agentPath) });
}

export function useCreateRoutine(agentPath: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewRoutine) => tauriRoutines.create(agentPath, input),
    onSuccess: () => afterRoutineWrite(qc, agentPath),
  });
}

export function useRoutineWritesForAnyAgent() {
  const qc = useQueryClient();
  const { t } = useTranslation("routines");
  const update = useMutation({
    mutationFn: ({
      agentPath,
      routineId,
      updates,
    }: RoutineWriteFor & {
      updates: RoutineUpdate;
      kind?: RoutineUpdateKind;
    }) => tauriRoutines.update(agentPath, routineId, updates),
    onMutate: ({ agentPath, routineId, updates }) => {
      const queryKey = queryKeys.routines(agentPath);
      void qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<Routine[]>(queryKey);
      const nowIso = new Date().toISOString();
      const patch: OptimisticPatch<Routine[]> = {
        queryKey,
        apply: (list) => patchRoutineList(list, routineId, updates, nowIso),
      };
      qc.setQueryData<Routine[]>(queryKey, patch.apply);
      return { previous, release: holdPatchesAcrossRefetch(qc, [patch]) };
    },
    onError: (err, { agentPath, kind }, context) => {
      context?.release();
      const key = queryKeys.routines(agentPath);
      if (context?.previous) qc.setQueryData(key, context.previous);
      qc.invalidateQueries({ queryKey: key });
      const failure = UPDATE_FAILURE[kind ?? "save"];
      toastRoutineWriteFailure(
        err,
        { title: t(failure.titleKey), command: failure.command },
        {
          addToast: useUIStore.getState().addToast,
          describe: genericErrorDescription,
        },
      );
    },
    onSuccess: (routine, { agentPath }, context) => {
      context?.release();
      qc.setQueryData<Routine[]>(queryKeys.routines(agentPath), (list) =>
        replaceRoutineInList(list, routine),
      );
      afterRoutineWrite(qc, agentPath);
    },
  });
  return { update, ...useRoutineRowWrites() };
}
