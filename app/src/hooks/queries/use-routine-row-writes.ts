import type { Routine, RoutineRun } from "@houston/engine-adapter";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { optimisticWrite } from "../../lib/optimistic-write";
import { queryKeys } from "../../lib/query-keys";
import { refetchIfRoutineGone } from "../../lib/routine-gone-surface";
import { removeRoutineFromList } from "../../lib/routine-optimistic";
import {
  addOptimisticRun,
  isOptimisticRunId,
  latestRunningRunId,
  markRunCancelled,
} from "../../lib/routine-run-optimistic";
import { tauriRoutines } from "../../lib/tauri";

export interface RoutineWriteFor {
  agentPath: string;
  routineId: string;
}

const startingRuns = new Map<string, Promise<void>>();
const runKey = ({ agentPath, routineId }: RoutineWriteFor) =>
  `${agentPath}\u0000${routineId}`;

async function hostRunId(
  qc: QueryClient,
  target: RoutineWriteFor,
  runId: string,
): Promise<string | undefined> {
  if (!isOptimisticRunId(runId)) return runId;
  await startingRuns.get(runKey(target));
  const runs = await qc.fetchQuery<RoutineRun[]>({
    queryKey: queryKeys.routineRuns(target.agentPath),
    queryFn: () => tauriRoutines.listRuns(target.agentPath),
  });
  return latestRunningRunId(runs, target.routineId);
}

export function useRoutineRowWrites() {
  const qc = useQueryClient();
  const { t } = useTranslation("routines");

  const remove = (target: RoutineWriteFor) => {
    void optimisticWrite({
      qc,
      command: "delete_routine",
      patches: [
        {
          queryKey: queryKeys.routines(target.agentPath),
          apply: (list: Routine[] | undefined) =>
            removeRoutineFromList(list, target.routineId),
        },
      ],
      write: async () =>
        tauriRoutines.delete(target.agentPath, target.routineId),
      failure: {
        title: t("toasts.deleteError"),
        description: t("toasts.deleteErrorBody"),
      },
    });
  };

  const runNow = (target: RoutineWriteFor) => {
    const nowIso = new Date().toISOString();
    const settled = optimisticWrite({
      qc,
      command: "run_routine_now",
      patches: [
        {
          queryKey: queryKeys.routineRuns(target.agentPath),
          apply: (runs: RoutineRun[] | undefined) =>
            addOptimisticRun(runs, target.routineId, nowIso),
        },
      ],
      write: async () =>
        tauriRoutines.runNow(target.agentPath, target.routineId),
      failure: {
        title: t("toasts.runError"),
        description: t("toasts.runErrorBody"),
      },
      onError: (err) =>
        refetchIfRoutineGone(qc, queryKeys.routines(target.agentPath), err),
    });
    const key = runKey(target);
    startingRuns.set(key, settled);
    void settled.then(() => {
      if (startingRuns.get(key) === settled) startingRuns.delete(key);
    });
  };

  const cancelRun = (target: RoutineWriteFor & { runId: string }) => {
    const nowIso = new Date().toISOString();
    void optimisticWrite({
      qc,
      command: "cancel_routine_run",
      patches: [
        {
          queryKey: queryKeys.routineRuns(target.agentPath),
          apply: (runs: RoutineRun[] | undefined) =>
            markRunCancelled(runs, target.routineId, target.runId, nowIso),
        },
      ],
      write: async () => {
        const runId = await hostRunId(qc, target, target.runId);
        if (runId === undefined) return;
        await tauriRoutines.cancelRun(
          target.agentPath,
          target.routineId,
          runId,
        );
      },
      failure: {
        title: t("toasts.stopError"),
        description: t("toasts.stopErrorBody"),
      },
    });
  };

  return { remove, runNow, cancelRun };
}
