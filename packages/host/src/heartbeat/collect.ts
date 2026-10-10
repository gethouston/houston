import {
  buildHeartbeatSnapshot,
  type HeartbeatAgentData,
  type HeartbeatSnapshot,
  loadActivities,
  loadRoutineRuns,
  loadRoutines,
} from "@houston/domain";
import type { UserId } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import type { WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";

export interface CollectDeps {
  store: WorkspaceStore;
  vfs: Vfs;
  paths: WorkspacePaths;
  /** Whose briefing: only their own workspaces are read, the turn runs in
   *  their name, and their personal workspace holds the manager. */
  userId: UserId;
  log: (message: string, err?: unknown) => void;
}

/**
 * Load every agent's board, routines and runs across the person's own
 * workspaces (dot-named agents, the manager among them, are never listed),
 * and reduce them to the briefing snapshot. `listWorkspaces` is the operator's
 * every-tenant list and never the source here, even where the two agree.
 *
 * Fail-isolated per agent: one agent with a mangled document is logged and
 * left out, never allowed to cost the person the whole briefing.
 */
export async function collectHeartbeatSnapshot(
  deps: CollectDeps,
  sinceMs: number,
): Promise<HeartbeatSnapshot> {
  const agents: HeartbeatAgentData[] = [];
  for (const ws of await deps.store.listWorkspacesForUser(deps.userId)) {
    for (const agent of await deps.store.listAgents(ws.id)) {
      const root = deps.paths.agentRoot(ws, agent);
      try {
        const [activities, routines, runs] = await Promise.all([
          loadActivities(deps.vfs, root),
          loadRoutines(deps.vfs, root),
          loadRoutineRuns(deps.vfs, root),
        ]);
        agents.push({
          agentName: agent.name,
          activities: activities.items,
          routines: routines.items,
          runs: runs.items,
        });
      } catch (err) {
        deps.log(`[heartbeat] skipped ${agent.id} in the snapshot:`, err);
      }
    }
  }
  return buildHeartbeatSnapshot(agents, sinceMs);
}
