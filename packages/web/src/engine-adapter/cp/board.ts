import type {
  Activity,
  ActivityUpdate,
} from "../../../../../ui/engine-client/src/types";
import { agentPath, type ControlPlaneConfig, cpFetch } from "./fetch";

/**
 * The MISSION board reads and the one generic write. An agent's routines are
 * the other half of what a board shows and live in `./routines`: same agent,
 * different lifecycle, and one file per lifecycle keeps either readable.
 */

/**
 * Lists the missions on an agent's board.
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
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
 *
 * Confirmed: irreversible. It overwrites a mission's fields in place, and no
 * earlier version is kept.
 * @param agentId The agent this acts on, by the id listAgents returns. An
 *   agent's name is not its id, so read the id from listAgents first.
 * @param id The mission to change, by the id listActivities returns.
 * @param updates Only the fields that change. A status is one of running,
 *   needs_you, done, error or archived.
 * @assistant group:missions confirm hidden: its session_key, origin_session_key and pending_interaction fields rewrite mission lineage and author approval cards; a status change belongs to the coordinator's update_mission_status tool.
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
