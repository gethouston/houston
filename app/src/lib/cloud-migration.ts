export interface LegacyDetection {
  hasWorkspaces: boolean;
  hasChatDb: boolean;
  workspaceDirs: string[];
  agentDirCount: number;
}

export interface SourceManifestEntry {
  path: string;
  size: number;
  kind: "core" | "file";
}

export interface SourceExcludedEntry {
  path: string;
  size: number;
  reason: string;
}

export interface SourceAgentManifest {
  entries: SourceManifestEntry[];
  excluded: SourceExcludedEntry[];
  integrations: string[];
  totalBytes: number;
}

export interface SourceAgent {
  id: string;
  workspaceId: string;
  name: string;
  manifest: SourceAgentManifest;
  color?: string;
}

export interface MigrationTask {
  sourceId: string;
  workspace: string;
  agent: string;
  targetName: string;
  alreadyDone: boolean;
  manifest: SourceAgentManifest;
  color?: string;
}

export const MAX_CHUNK_RAW_BYTES = 8 * 1024 * 1024;

export interface UploadChunk {
  paths: string[];
  bytes: number;
}

export function chunkPaths(
  entries: SourceManifestEntry[],
  maxBytes: number = MAX_CHUNK_RAW_BYTES,
): UploadChunk[] {
  const ordered = [
    ...entries.filter((e) => e.kind === "core"),
    ...entries.filter((e) => e.kind !== "core"),
  ];
  const chunks: UploadChunk[] = [];
  let current: UploadChunk | null = null;
  for (const entry of ordered) {
    if (!current || current.bytes + entry.size > maxBytes) {
      current = { paths: [], bytes: 0 };
      chunks.push(current);
    }
    current.paths.push(entry.path);
    current.bytes += entry.size;
  }
  return chunks;
}

export function collectIntegrations(
  sourceAgents: SourceAgent[],
  accountIntegrations: string[] = [],
): string[] {
  const all = new Set<string>(accountIntegrations);
  for (const a of sourceAgents) {
    for (const slug of a.manifest.integrations) all.add(slug);
  }
  return [...all].sort();
}

export function doneScreenOutcome(failedAgents: number): "done" | "skipped" {
  return failedAgents > 0 ? "skipped" : "done";
}

export function hasReconnectAppsStep(counts: {
  integrations: number;
  failedAgents: number;
  excludedFiles: number;
  rejectedFiles: number;
}): boolean {
  return (
    counts.integrations > 0 ||
    counts.failedAgents > 0 ||
    counts.excludedFiles > 0 ||
    counts.rejectedFiles > 0
  );
}
