/**
 * Shared tail of a cloud-migration run (HOU-719): stop the source host,
 * refresh the agent list the shell will render, fire the completion analytics.
 * Split from `stores/cloud-migration.ts` so the driver store stays focused on
 * the per-task state machine.
 */

import { analytics } from "../lib/analytics";
import type { MigrationTask } from "../lib/cloud-migration";
import type { AgentMigrationProgress } from "../lib/cloud-migration-progress";
import { reportError } from "../lib/error-toast";
import { osStopMigrationSourceHost } from "../lib/os-bridge";
import { useAgentStore } from "./agents";
import { useWorkspaceStore } from "./workspaces";

export interface FinishSnapshot {
  tasks: MigrationTask[];
  progress: Record<string, AgentMigrationProgress>;
}

export async function finishRun(
  get: () => FinishSnapshot,
  setScreenDone: () => void,
): Promise<void> {
  try {
    await osStopMigrationSourceHost();
  } catch (err) {
    // Not user-blocking (the process dies with the app) but never invisible.
    reportError(
      "cloud_migration_stop_source",
      err instanceof Error ? err.message : String(err),
      err,
    );
  }
  const workspaceId = useWorkspaceStore.getState().workspaces[0]?.id;
  if (workspaceId) {
    await useAgentStore.getState().loadAgents(workspaceId, { silent: true });
  }
  const { tasks, progress } = get();
  analytics.track("cloud_migration_completed", {
    agent_count: tasks.filter((t) => progress[t.sourceId]?.step === "done")
      .length,
    workspace_count: new Set(tasks.map((t) => t.workspace)).size,
  });
  setScreenDone();
}
