import type { RoutineRun } from "@houston/engine-adapter";

const PLACEHOLDER_PREFIX = "optimistic-run:";

export function isOptimisticRunId(runId: string): boolean {
  return runId.startsWith(PLACEHOLDER_PREFIX);
}

export function latestRunningRunId(
  runs: RoutineRun[] | undefined,
  routineId: string,
): string | undefined {
  let latest: RoutineRun | undefined;
  for (const run of runs ?? []) {
    if (run.routine_id !== routineId || run.status !== "running") continue;
    if (!latest || run.started_at > latest.started_at) latest = run;
  }
  return latest?.id;
}

export function addOptimisticRun(
  runs: RoutineRun[] | undefined,
  routineId: string,
  nowIso: string,
): RoutineRun[] | undefined {
  const id = `${PLACEHOLDER_PREFIX}${routineId}`;
  if (!runs || runs.some((run) => run.id === id)) return runs;
  if (latestRunningRunId(runs, routineId)) return runs;
  return [
    ...runs,
    {
      id,
      routine_id: routineId,
      status: "running",
      session_key: "",
      started_at: nowIso,
    },
  ];
}

export function markRunCancelled(
  runs: RoutineRun[] | undefined,
  routineId: string,
  runId: string,
  nowIso: string,
): RoutineRun[] | undefined {
  const painted = runs?.some(
    (run) =>
      run.routine_id === routineId &&
      run.status === "cancelled" &&
      run.completed_at === nowIso,
  );
  if (painted) return runs;
  const target = isOptimisticRunId(runId)
    ? latestRunningRunId(runs, routineId)
    : runId;
  if (!runs || !target) return runs;
  return runs.map((run) =>
    run.id === target && run.status === "running"
      ? { ...run, status: "cancelled", completed_at: nowIso }
      : run,
  );
}
