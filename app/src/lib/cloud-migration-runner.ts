/**
 * Per-agent migration runner (HOU-719): drives ONE task through
 * creating → warming → uploading → finalizing, reporting each transition to
 * the store. Throws `MigrationStepError` (carrying the failed step) so the
 * store can park the task in a retryable error state — never a silent skip.
 */

import { runProvisioningProbe } from "./agent-provisioning";
import { chunkPaths, type MigrationTask } from "./cloud-migration";
import type {
  AgentMigrationProgress,
  MigrationCounts,
  MigrationStep,
} from "./cloud-migration-progress";
import {
  completeAgentMigration,
  exportSourceZip,
  importAgentZip,
  type SourceHostHandshake,
} from "./cloud-migration-transport";
import { getEngine } from "./engine";

export class MigrationStepError extends Error {
  readonly step: Exclude<MigrationStep, "error">;
  constructor(step: Exclude<MigrationStep, "error">, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "MigrationStepError";
    this.step = step;
  }
}

/** The cloud agents are created as ordinary personal assistants. */
const MIGRATED_AGENT_CONFIG_ID = "personal-assistant";

export interface RunTaskDeps {
  /** The synthetic v3 workspace the cloud agents are created in. */
  workspaceId: string;
  source: SourceHostHandshake;
  /** Current progress (carries `createdAgentId` across a retry). */
  getProgress: () => AgentMigrationProgress;
  patchProgress: (patch: Partial<AgentMigrationProgress>) => void;
  /** Retry run — imports pass `overwrite=1` to land over a partial attempt. */
  overwrite: boolean;
}

async function step<T>(
  name: Exclude<MigrationStep, "error">,
  work: () => Promise<T>,
): Promise<T> {
  try {
    return await work();
  } catch (err) {
    throw err instanceof MigrationStepError
      ? err
      : new MigrationStepError(name, err);
  }
}

/**
 * Long-poll the freshly created agent until its pod answers — the exact
 * readiness contract the post-create UI uses (`lib/agent-provisioning.ts`):
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
  // 1. Create the cloud agent — unless a previous attempt already did (the
  //    Retry path must never mint a duplicate).
  let agentId = deps.getProgress().createdAgentId;
  let agentPath = deps.getProgress().createdAgentPath;
  if (!agentId || !agentPath) {
    deps.patchProgress({ step: "creating" });
    const created = await step("creating", () =>
      getEngine().createAgent(deps.workspaceId, {
        name: task.targetName,
        configId: MIGRATED_AGENT_CONFIG_ID,
        // Seed the legacy overlay color onto the created cloud agent. The cp
        // adapter's create routes `color` into the color overlay keyed by the
        // NEW agent id (createdAgentToUi → setColor); undefined falls back to
        // DEFAULT_AGENT_COLOR — so this is the only seed point needed.
        color: task.color,
      }),
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
    deps.patchProgress({ step: "uploading", chunkIndex: i + 1 });
    await step("uploading", async () => {
      const zip = await exportSourceZip(
        deps.source,
        task.sourceId,
        chunks[i].paths,
      );
      const result = await importAgentZip(agentId, zip, {
        overwrite: deps.overwrite,
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
