import type { UploadProgress } from "@houston/engine-adapter";
import type { MigrationTask } from "./cloud-migration";

export type MigrationStep =
  | "pending"
  | "creating"
  | "warming"
  | "uploading"
  | "finalizing"
  | "done"
  | "error";

export interface MigrationCounts {
  written: number;
  skipped: number;
  rejected: number;
  sessionsRebuilt: boolean;
}

export interface AgentMigrationProgress {
  step: MigrationStep;
  chunkIndex: number;
  chunkCount: number;
  uploadProgress?: UploadProgress;
  createdAgentId?: string;
  createdAgentPath?: string;
  errorStep?: Exclude<MigrationStep, "error">;
  errorMessage?: string;
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
      const current = p.uploadProgress;
      const chunks = current
        ? Math.max(0, p.chunkIndex - 1) +
          (current.totalBytes > 0 ? current.sentBytes / current.totalBytes : 0)
        : p.chunkIndex;
      const done = Math.min(Math.max(chunks, 0), p.chunkCount) / p.chunkCount;
      return UPLOAD_START + (UPLOAD_END - UPLOAD_START) * done;
    }
    case "finalizing":
      return 0.95;
    case "done":
      return 1;
    case "error":
      return p.errorStep ? stepFraction({ ...p, step: p.errorStep }) : 0;
  }
}

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
