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
  return {
    step: task.alreadyDone ? "done" : "pending",
    chunkIndex: 0,
    chunkCount: 0,
    rejected: [],
    counts: { written: 0, skipped: 0, rejected: 0, sessionsRebuilt: false },
  };
}

/**
 * Fixed phase weights for a single agent's 0..1 completion, chosen so the
 * fraction is monotonic non-decreasing along the state machine
 * (`pending → creating → warming → uploading → finalizing → done`):
 *
 * | step         | fraction                                        |
 * | ------------ | ----------------------------------------------- |
 * | pending      | 0                                               |
 * | creating     | 0.10                                            |
 * | warming      | 0.25                                            |
 * | uploading    | 0.25 → 0.90, scaled by `chunkIndex / chunkCount` |
 * | finalizing   | 0.95                                            |
 * | done         | 1                                               |
 * | error        | the fraction of `errorStep` (its last reached)  |
 *
 * `uploading` spans the widest band because it is the bulk of the work; the
 * 1-based `chunkIndex` fills it (chunk `i` of `n` done ⇒ `0.25 + 0.65·i/n`).
 * A zero `chunkCount` (upload not yet chunked) sits at the band's start, 0.25.
 */
const UPLOAD_START = 0.25;
const UPLOAD_END = 0.9;

function stepFraction(p: AgentMigrationProgress): number {
  switch (p.step) {
    case "pending":
      return 0;
    case "creating":
      return 0.1;
    case "warming":
      return 0.25;
    case "uploading": {
      if (p.chunkCount <= 0) return UPLOAD_START;
      const done =
        Math.min(Math.max(p.chunkIndex, 0), p.chunkCount) / p.chunkCount;
      return UPLOAD_START + (UPLOAD_END - UPLOAD_START) * done;
    }
    case "finalizing":
      return 0.95;
    case "done":
      return 1;
    case "error":
      // Error freezes at the last fraction the failed step had reached.
      return p.errorStep ? stepFraction({ ...p, step: p.errorStep }) : 0;
  }
}

/**
 * Overall 0..1 progress across every migration task, byte-weighted by each
 * agent's `manifest.totalBytes` (bigger agents move the bar more). When the
 * whole plan reports zero bytes, weights fall back to equal per task. Tasks
 * missing from `progress` count as `pending` (0). Monotonic non-decreasing for
 * a fixed task set, since each task's {@link stepFraction} only ever advances.
 */
export function computeOverallProgress(
  tasks: ReadonlyArray<{ sourceId: string; manifest: { totalBytes: number } }>,
  progress: Readonly<Record<string, AgentMigrationProgress>>,
): number {
  if (tasks.length === 0) return 0;
  const totalBytes = tasks.reduce(
    (sum, t) => sum + Math.max(t.manifest.totalBytes, 0),
    0,
  );
  const equalWeight = totalBytes <= 0;
  let weighted = 0;
  let weightSum = 0;
  for (const task of tasks) {
    const weight = equalWeight ? 1 : Math.max(task.manifest.totalBytes, 0);
    const p = progress[task.sourceId];
    weighted += weight * (p ? stepFraction(p) : 0);
    weightSum += weight;
  }
  return weightSum > 0 ? weighted / weightSum : 0;
}
