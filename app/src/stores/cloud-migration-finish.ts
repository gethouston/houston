/**
 * Shared tails of a cloud-migration run (HOU-719): how one task's failure
 * settles, and the end of the whole run (stop the source host, refresh the
 * agent list the shell will render, fire the completion analytics). Split
 * from `stores/cloud-migration.ts` so the driver store stays focused on the
 * per-task state machine.
 */

import { analytics } from "../lib/analytics";
import type { MigrationTask } from "../lib/cloud-migration";
import type { AgentMigrationProgress } from "../lib/cloud-migration-progress";
import { taskFailureOutcome } from "../lib/cloud-migration-step";
import { reportError } from "../lib/error-report";
import { osStopMigrationSourceHost } from "../lib/os-bridge";
import { useAgentStore } from "./agents";
import { useWorkspaceStore } from "./workspaces";

export interface FinishSnapshot {
  tasks: MigrationTask[];
  progress: Record<string, AgentMigrationProgress>;
}

/**
 * A task that failed AFTER the user chose "Migrate later" was abandoned, not
 * broken: the source host is already gone, so the failure is the bail-out's
 * own consequence. It goes back to `pending` (the Settings resume re-runs
 * it) with nothing to report. Any other failure parks the row in the
 * retryable `error` state and reaches Sentry.
 */
export function settleTaskFailure(
  patch: (patch: Partial<AgentMigrationProgress>) => void,
  current: AgentMigrationProgress | undefined,
  err: unknown,
  deferred: boolean,
): void {
  const outcome = taskFailureOutcome(err, deferred);
  if (outcome.kind === "abandoned") {
    analytics.track("cloud_migration_agent_deferred", { step: current?.step });
    patch({ step: "pending", errorStep: undefined, errorMessage: undefined });
    return;
  }
  patch({
    step: "error",
    errorStep: outcome.step,
    errorMessage: outcome.message,
  });
  analytics.track("cloud_migration_agent_failed", { step: outcome.step });
  reportError("cloud_migration_agent", outcome.message, err);
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
  // The done screen persists the per-machine "done" outcome via `persistOutcome`
  // (use-cloud-migration.ts), which is the flag the wizard gate reads — identity
  // (Firebase) has no client-writable user metadata for a cross-machine record.
  // Cross-machine RESUME still holds via the gateway's per-agent import markers.
  setScreenDone();
}
