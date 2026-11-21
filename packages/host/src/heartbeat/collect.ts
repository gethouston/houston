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
  userId: UserId;
  log: (message: string, err?: unknown) => void;
}

export async function collectHeartbeatSnapshot(
  deps: CollectDeps,
  sinceMs: number,
  seen: ReadonlySet<string>,
): Promise<HeartbeatSnapshot> {
  const agents: HeartbeatAgentData[] = [];
  const unread: string[] = [];
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
          agentId: agent.id,
          agentName: agent.name,
          activities: activities.items,
          routines: routines.items,
          runs: runs.items,
        });
        const diagnostics = [
          ...activities.diagnostics,
          ...routines.diagnostics,
          ...runs.diagnostics,
        ];
        if (diagnostics.length > 0) {
          deps.log(
            `[heartbeat] ${agent.id} read incompletely: ${diagnostics.map((d) => `${d.key}: ${d.message}`).join("; ")}`,
          );
          unread.push(agent.id);
        }
      } catch (err) {
        deps.log(`[heartbeat] skipped ${agent.id} in the snapshot:`, err);
        unread.push(agent.id);
      }
    }
  }
  return buildHeartbeatSnapshot(agents, sinceMs, seen, unread);
}
