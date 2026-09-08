import type {
  Routine,
  RoutineRun,
  WebhookKeyReveal,
} from "../../../../../ui/engine-client/src/types";
import { HoustonEngineError } from "../client/errors";
import { agentPath, type ControlPlaneConfig, cpFetch } from "./fetch";

/**
 * An agent's ROUTINES: the work it repeats on a schedule, the record of the
 * times it ran, and the incoming-webhook key an outside service starts one
 * with. Split from `./board` (the mission surface) so each file is one
 * lifecycle; both hang off the same `/agents/:id` prefix.
 */

/**
 * Lists an agent's routines.
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
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
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
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
 *
 * Confirmed: money. A routine keeps firing on its own schedule once it exists,
 * spending model budget on every run until someone stops it.
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param input The routine to create: what it should do and when it should
 *   run.
 * @assistant group:routines confirm
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
 *
 * Confirmed: money. A schedule edit retargets recurring spend, changing how
 * often the agent runs and is billed from then on.
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param id The routine to change, by the id listRoutines returns.
 * @param updates Only the fields that change; anything omitted is left as
 *   it was.
 * @assistant group:routines confirm
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
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param id The routine to delete, by the id listRoutines returns.
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
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param id The routine to run now, by the id listRoutines returns.
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
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param routineId The routine, by the id listRoutines returns.
 * @param runId The run to stop, by the id listRoutineRuns returns.
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
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param routineId The routine, by the id listRoutines returns.
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
