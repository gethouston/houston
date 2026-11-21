import { analytics } from "../lib/analytics";
import type { MigrationTask } from "../lib/cloud-migration";
import type { AgentMigrationProgress } from "../lib/cloud-migration-progress";
import { taskFailureOutcome } from "../lib/cloud-migration-step";
import { reportError } from "../lib/error-report";
import i18n from "../lib/i18n";
import { osStopMigrationSourceHost } from "../lib/os-bridge";
import { useAgentStore } from "./agents";
import { useWorkspaceStore } from "./workspaces";

export interface FinishSnapshot {
  tasks: MigrationTask[];
  progress: Record<string, AgentMigrationProgress>;
}

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
    errorMessage: outcome.transport
      ? i18n.t("migration:transport.interrupted")
      : outcome.message,
  });
  analytics.track("cloud_migration_agent_failed", { step: outcome.step });
  reportError("cloud_migration_agent", outcome.message, outcome.cause);
}

export async function finishRun(
  get: () => FinishSnapshot,
  setScreenDone: () => void,
): Promise<void> {
  try {
    await osStopMigrationSourceHost();
  } catch (err) {
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
