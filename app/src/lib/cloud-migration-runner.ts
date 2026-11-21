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
  workspaceId: string;
  source: SourceHostHandshake;
  getProgress: () => AgentMigrationProgress;
  patchProgress: (patch: Partial<AgentMigrationProgress>) => void;
  overwrite: boolean;
  isAbandoned: () => boolean;
}

function waitForAgentReady(agentId: string, agentPath: string): Promise<void> {
  const entry = { agentId, agentPath, since: Date.now() };
  return new Promise((resolve, reject) => {
    void runProvisioningProbe(entry, {
      readFile: (path, rel) => getEngine().readAgentFile(path, rel),
      isMarked: () => true,
      onReady: () => resolve(),
      onGone: (_id, err) => reject(err),
      onTimeout: (_id, lastError) =>
        reject(lastError ?? new Error("the new assistant never became ready")),
      sleep: (ms) => new Promise<void>((r) => setTimeout(r, ms)),
      now: () => Date.now(),
    });
  });
}

export async function runMigrationTask(
  task: MigrationTask,
  deps: RunTaskDeps,
): Promise<MigrationCounts> {
  const step = <T>(name: RunnableStep, work: () => Promise<T>) =>
    runStep(name, work, deps.isAbandoned);
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

  deps.patchProgress({ step: "warming" });
  await step("warming", () => waitForAgentReady(agentId, agentPath));

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
      rejected.push(...result.rejected);
    });
  }

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
