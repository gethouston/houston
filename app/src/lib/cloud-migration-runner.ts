/**
 * Per-agent migration runner (HOU-719): drives ONE task through
 * creating → warming → uploading → finalizing, reporting each transition to
 * the store. Throws `MigrationStepError` (carrying the failed step) so the
 * store can park the task in a retryable error state — never a silent skip —
 * and `MigrationAbandonedError` once the user has deferred the run (see
 * `cloud-migration-step.ts`).
 */

import { runProvisioningProbe } from "./agent-provisioning/probe";
import { chunkPaths, type MigrationTask } from "./cloud-migration";
import { migratedAgentCreate } from "./cloud-migration-plan";
import type {
  AgentMigrationProgress,
  MigrationCounts,
} from "./cloud-migration-progress";
import { type RunnableStep, runStep } from "./cloud-migration-step";
import {
  completeAgentMigration,
  exportSourceZip,
  importAgentZip,
  type SourceHostHandshake,
} from "./cloud-migration-transport";
import { getEngine } from "./engine";

export interface RunTaskDeps {
  /** The synthetic v3 workspace the cloud agents are created in. */
  workspaceId: string;
  source: SourceHostHandshake;
  /** Current progress (carries `createdAgentId` across a retry). */
  getProgress: () => AgentMigrationProgress;
  patchProgress: (patch: Partial<AgentMigrationProgress>) => void;
  /** Retry run — imports pass `overwrite=1` to land over a partial attempt. */
  overwrite: boolean;
  /** True once the user chose "Migrate later": no further step may start,
   *  the source host every export needs is already gone. */
  isAbandoned: () => boolean;
}

/**
 * Long-poll the freshly created agent until its pod answers — the exact
 * readiness contract the post-create UI uses (`lib/agent-provisioning/probe.ts`):
 * any per-agent request is held server-side until the engine is reachable, so
 * a cheap read doubles as the probe. Reused, not reimplemented (HOU-693).
 */
function waitForAgentReady(agentId: string, agentPath: string): Promise<void> {
  const entry = { agentId, agentPath, since: Date.now() };
  return new Promise((resolve, reject) => {
    void runProvisioningProbe(entry, {
      readFile: (path, rel) => getEngine().readAgentFile(path, rel),
      isMarked: () => true, // the wizard task is the probe's whole lifetime
      onReady: () => resolve(),
      // The agent the wizard JUST created answered "agent not found" — the
      // creation didn't stick. A real failure here, not a stale roster: fail
      // the step so the wizard surfaces it and Retry re-creates.
      onGone: (_id, err) => reject(err),
      onTimeout: (_id, lastError) =>
        reject(lastError ?? new Error("the new assistant never became ready")),
      sleep: (ms) => new Promise<void>((r) => setTimeout(r, ms)),
      now: () => Date.now(),
    });
  });
}

/** Drive one task to completion. Resolves with the accumulated counts. */
export async function runMigrationTask(
  task: MigrationTask,
  deps: RunTaskDeps,
): Promise<MigrationCounts> {
  const step = <T>(name: RunnableStep, work: () => Promise<T>) =>
    runStep(name, work, deps.isAbandoned);
  // 1. Create the cloud agent — unless a previous attempt already did (the
  //    Retry path must never mint a duplicate).
  let agentId = deps.getProgress().createdAgentId;
  let agentPath = deps.getProgress().createdAgentPath;
  if (!agentId || !agentPath) {
    deps.patchProgress({ step: "creating" });
    const created = await step("creating", () =>
      getEngine().createAgent(deps.workspaceId, migratedAgentCreate(task)),
    );
    agentId = created.agent.id;
    agentPath = created.agent.folderPath;
    deps.patchProgress({
      createdAgentId: agentId,
      createdAgentPath: agentPath,
    });
  }

  // 2. Wait for its pod (creation answers before the engine is reachable).
  deps.patchProgress({ step: "warming" });
  await step("warming", () => waitForAgentReady(agentId, agentPath));

  // 3. Export from the source host + import into the pod, chunk by chunk.
  const chunks = chunkPaths(task.manifest.entries);
  const counts: MigrationCounts = {
    written: 0,
    skipped: 0,
    rejected: 0,
    sessionsRebuilt: false,
  };
  const rejected: Array<{ path: string; reason: string }> = [];
  deps.patchProgress({
    step: "uploading",
    chunkIndex: 0,
    chunkCount: chunks.length,
  });
  for (let i = 0; i < chunks.length; i++) {
    deps.patchProgress({
      step: "uploading",
      chunkIndex: i + 1,
      uploadProgress: {
        sentBytes: 0,
        totalBytes: chunks[i].bytes,
        phase: "uploading",
      },
    });
    await step("uploading", async () => {
      const zip = await exportSourceZip(
        deps.source,
        task.sourceId,
        chunks[i].paths,
      );
      const result = await importAgentZip(agentId, zip, {
        overwrite: deps.overwrite,
        onProgress: (uploadProgress) => deps.patchProgress({ uploadProgress }),
      });
      counts.written += result.written;
      counts.skipped += result.skipped;
      counts.rejected += result.rejected.length;
      counts.sessionsRebuilt = counts.sessionsRebuilt || result.sessionsRebuilt;
      // Rejected paths surface on the done summary — never swallowed.
      rejected.push(...result.rejected);
    });
  }

  // 4. Stamp the marker so a later run resumes instead of re-importing.
  deps.patchProgress({ step: "finalizing", rejected });
  await step("finalizing", () =>
    completeAgentMigration(
      agentId,
      { workspace: task.workspace, agent: task.agent },
      counts,
    ),
  );

  deps.patchProgress({ step: "done", counts });
  return counts;
}
