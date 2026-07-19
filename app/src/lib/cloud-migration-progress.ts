/**
 * Per-agent progress state machine for the cloud-migration wizard (HOU-719):
 *
 *   pending → creating → warming → uploading (i of n) → finalizing → done
 *
 * Any step may fail into `error` (carrying the failed step); Retry re-runs the
 * task from its first incomplete step. Dependency-free, `node --test`-able.
 */

import type { MigrationTask } from "./cloud-migration";

export type MigrationStep =
  | "pending"
  | "creating"
  | "warming"
  | "uploading"
  | "finalizing"
  | "done"
  | "error";

/** Import counters accumulated across an agent's chunks. */
export interface MigrationCounts {
  written: number;
  skipped: number;
  rejected: number;
  /** Whether the pod could anchor re-synthesized chat sessions (host-reported). */
  sessionsRebuilt: boolean;
}

export interface AgentMigrationProgress {
  step: MigrationStep;
  /** 1-based chunk being uploaded, meaningful while `step === "uploading"`. */
  chunkIndex: number;
  chunkCount: number;
  /** Files confirmed landed in the cloud (written or already there), out of
   *  `filesTotal` — the row's live "{{done}} of {{total}}" counter. */
  filesDone: number;
  filesTotal: number;
  /** Paths riding the upload request currently in flight (live file line). */
  currentPaths: string[];
  /** Set once the cloud agent exists — Retry must not create a duplicate. */
  createdAgentId?: string;
  createdAgentPath?: string;
  /** The step that failed, when `step === "error"`. */
  errorStep?: Exclude<MigrationStep, "error">;
  errorMessage?: string;
  /** Import-rejected files (surfaced on the done summary, never swallowed). */
  rejected: Array<{ path: string; reason: string }>;
  counts: MigrationCounts;
}

export function initialProgress(task: MigrationTask): AgentMigrationProgress {
  const filesTotal = task.manifest.entries.length;
  return {
    step: task.alreadyDone ? "done" : "pending",
    chunkIndex: 0,
    chunkCount: 0,
    filesDone: task.alreadyDone ? filesTotal : 0,
    filesTotal,
    currentPaths: [],
    rejected: [],
    counts: { written: 0, skipped: 0, rejected: 0, sessionsRebuilt: false },
  };
}
