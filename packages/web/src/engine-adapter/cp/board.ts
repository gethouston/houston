import type {
  Activity,
  ActivityUpdate,
  Routine,
  RoutineRun,
  WebhookKeyReveal,
} from "../../../../../ui/engine-client/src/types";
import { HoustonEngineError } from "../client/errors";
import { agentPath, type ControlPlaneConfig, cpFetch } from "./fetch";

/**
 * Lists the missions on an agent's board.
 * @assistant group:missions
 */
export async function listActivities(
  cfg: ControlPlaneConfig,
  agentId: string,
): Promise<Activity[]> {
  const res = await cpFetch(cfg, `${agentPath(agentId)}/activities`);
  return ((await res.json()) as { items: Activity[] }).items;
}
// create + delete WRITES delegate to `sdk.activities.writes.*` (byte-identical
// POST/DELETE, no refetch) — see `client/activities-mixin.ts`. `updateActivity`
// stays here: it is a GENERIC `ActivityUpdate` PATCH (status, pending_interaction,
// title, …) that no single SDK write (setStatus `{status}` / rename `{title}`)
// reproduces byte-for-byte, so it can't delegate without an SDK change.
/**
 * Updates a mission's details or status.
 * @assistant group:missions
 */
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
/**
 * Lists an agent's routines.
 * @assistant group:routines
 * @assistant unschematized: a routine's trigger_config is the outside app's own event shape.
 */
export async function listRoutines(
  cfg: ControlPlaneConfig,
  agentId: string,
): Promise<Routine[]> {
  const res = await cpFetch(cfg, `${agentPath(agentId)}/routines`);
  return ((await res.json()) as { items: Routine[] }).items;
}
/**
 * Lists the times an agent's routines have run, including any run in progress.
 * @assistant group:routines
 */
export async function listRoutineRuns(
  cfg: ControlPlaneConfig,
  agentId: string,
): Promise<RoutineRun[]> {
  const res = await cpFetch(cfg, `${agentPath(agentId)}/routine_runs`);
  return ((await res.json()) as { items: RoutineRun[] }).items;
}

/**
 * Creates a routine so an agent repeats work on a schedule.
 * @assistant group:routines
 * @assistant unschematized: debt: input is typed unknown; it should carry the routine wire shape so a caller can build one.
 */
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
/**
 * Updates a routine's schedule or instructions.
 * @assistant group:routines
 * @assistant unschematized: debt: updates is typed unknown; it should carry the routine wire shape so a caller can build one.
 */
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
/**
 * Deletes a routine so it stops running on its schedule.
 * @assistant group:routines confirm
 */
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

/**
 * Runs a routine right now instead of waiting for its next scheduled time.
 *
 * Fire a routine immediately — the host records a routine_run and starts the turn now.
 * @assistant group:routines confirm
 */
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

/**
 * Stops a routine run that is currently under way.
 *
 * Stop an in-flight routine run — the host flips the row terminal, then aborts the turn.
 * @assistant group:routines confirm
 */
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

/**
 * Creates a fresh key that lets an outside service start a routine, replacing any key issued before.
 *
 * Mint (or rotate) a routine's incoming-webhook key, or `null` when the gateway
 * does not serve webhook keys (404). Calling again ROTATES: the old secret is
 * invalidated. Callers treat `null` as "webhook keys unsupported here"; every
 * other error throws. Mirrors `agentTriggerStatus`'s 404 degrade.
 *
 * Hidden: the reply carries the raw secret, and an operation the assistant can
 * call is an operation whose result can end up quoted back into a chat.
 * @assistant group:routines confirm hidden: returns a secret; the webhook key is revealed once and calling again rotates it.
 */
export async function mintRoutineWebhookKey(
  cfg: ControlPlaneConfig,
  agentId: string,
  routineId: string,
): Promise<WebhookKeyReveal | null> {
  try {
    // The mint is a GATEWAY control route (`/v1/agents/…`, like trigger-status)
    // — NOT an agent-proxy path: `agentPath()` would forward it to the engine
    // pod, which never serves webhook keys, and its 404 would read as "this
    // host can't mint" on a gateway that can (HOU-807).
    const res = await cpFetch(
      cfg,
      `/v1/agents/${encodeURIComponent(agentId)}/routines/${encodeURIComponent(routineId)}/webhook-key`,
      { method: "POST" },
    );
    return (await res.json()) as WebhookKeyReveal;
  } catch (err) {
    if (err instanceof HoustonEngineError && err.status === 404) return null;
    throw err;
  }
}
