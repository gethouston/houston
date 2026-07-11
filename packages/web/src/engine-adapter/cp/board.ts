import type {
  Activity,
  ActivityUpdate,
  NewActivity,
  Routine,
  RoutineRun,
} from "../../../../../ui/engine-client/src/types";
import { agentPath, type ControlPlaneConfig, cpFetch } from "./fetch";

export async function listActivities(
  cfg: ControlPlaneConfig,
  agentId: string,
): Promise<Activity[]> {
  const res = await cpFetch(cfg, `${agentPath(agentId)}/activities`);
  return ((await res.json()) as { items: Activity[] }).items;
}
export async function createActivity(
  cfg: ControlPlaneConfig,
  agentId: string,
  input: NewActivity,
): Promise<Activity> {
  const res = await cpFetch(cfg, `${agentPath(agentId)}/activities`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return (await res.json()) as Activity;
}
export async function updateActivity(
  cfg: ControlPlaneConfig,
  agentId: string,
  id: string,
  updates: ActivityUpdate,
): Promise<Activity> {
  const res = await cpFetch(
    cfg,
    `${agentPath(agentId)}/activities/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(updates),
    },
  );
  return (await res.json()) as Activity;
}
export async function deleteActivity(
  cfg: ControlPlaneConfig,
  agentId: string,
  id: string,
): Promise<void> {
  await cpFetch(
    cfg,
    `${agentPath(agentId)}/activities/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export async function listRoutines(
  cfg: ControlPlaneConfig,
  agentId: string,
): Promise<Routine[]> {
  const res = await cpFetch(cfg, `${agentPath(agentId)}/routines`);
  return ((await res.json()) as { items: Routine[] }).items;
}
export async function listRoutineRuns(
  cfg: ControlPlaneConfig,
  agentId: string,
): Promise<RoutineRun[]> {
  const res = await cpFetch(cfg, `${agentPath(agentId)}/routine_runs`);
  return ((await res.json()) as { items: RoutineRun[] }).items;
}

export async function createRoutine(
  cfg: ControlPlaneConfig,
  agentId: string,
  input: unknown,
): Promise<Routine> {
  const res = await cpFetch(cfg, `${agentPath(agentId)}/routines`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return (await res.json()) as Routine;
}
export async function updateRoutine(
  cfg: ControlPlaneConfig,
  agentId: string,
  id: string,
  updates: unknown,
): Promise<Routine> {
  const res = await cpFetch(
    cfg,
    `${agentPath(agentId)}/routines/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(updates),
    },
  );
  return (await res.json()) as Routine;
}
export async function deleteRoutine(
  cfg: ControlPlaneConfig,
  agentId: string,
  id: string,
): Promise<void> {
  await cpFetch(
    cfg,
    `${agentPath(agentId)}/routines/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

/** Fire a routine immediately — the host records a routine_run and starts the turn now. */
export async function runRoutineNow(
  cfg: ControlPlaneConfig,
  agentId: string,
  id: string,
): Promise<void> {
  await cpFetch(
    cfg,
    `${agentPath(agentId)}/routines/${encodeURIComponent(id)}/run`,
    { method: "POST" },
  );
}

/** Stop an in-flight routine run — the host flips the row terminal, then aborts the turn. */
export async function cancelRoutineRun(
  cfg: ControlPlaneConfig,
  agentId: string,
  routineId: string,
  runId: string,
): Promise<RoutineRun> {
  const res = await cpFetch(
    cfg,
    `${agentPath(agentId)}/routines/${encodeURIComponent(routineId)}/runs/${encodeURIComponent(runId)}/cancel`,
    { method: "POST" },
  );
  return (await res.json()) as RoutineRun;
}
