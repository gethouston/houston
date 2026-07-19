/**
 * Pure logic for the first-run desktop→cloud migration wizard (HOU-719).
 *
 * The cloud-only desktop build finds the OLD local install's data
 * (`~/.houston`, written by the legacy desktop app) and offers to move every
 * legacy agent into the user's cloud account. This module owns the plan
 * (target names, collision renames, resume), the chunking of an agent's
 * manifest into upload-sized batches, and the per-agent progress state types.
 * I/O lives in `cloud-migration-transport.ts` / `stores/cloud-migration.ts`.
 *
 * Kept dependency-free so `node --test` can exercise it directly
 * (see `app/tests/cloud-migration.test.ts`).
 */

/** `detect_legacy_houston` result — is there old desktop data on this machine. */
export interface LegacyDetection {
  hasWorkspaces: boolean;
  hasChatDb: boolean;
  workspaceDirs: string[];
  agentDirCount: number;
}

export interface SourceManifestEntry {
  path: string;
  size: number;
  /** "core" = agent memory/config/history (upload first); "file" = working files. */
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
  /** Composio toolkit slugs the legacy agent had connected. */
  integrations: string[];
  totalBytes: number;
}

/** One legacy agent, as reported by the source host's `/v1/migration/source`. */
export interface SourceAgent {
  /** `"<Workspace>/<Agent>"` — the source host's agent id. */
  id: string;
  workspaceId: string;
  name: string;
  manifest: SourceAgentManifest;
}

/** A cloud agent that already exists, with its import marker (when probed). */
export interface ExistingCloudAgent {
  name: string;
  /** The `migration/status` marker's source, `null`/absent when never imported. */
  importedSource?: { workspace: string; agent: string } | null;
}

export interface MigrationTask {
  sourceId: string;
  workspace: string;
  agent: string;
  /** The cloud agent name this source agent migrates into. */
  targetName: string;
  /** A previous run already completed this agent — skip it (resume). */
  alreadyDone: boolean;
  manifest: SourceAgentManifest;
}

const normalize = (name: string) => name.trim().toLowerCase();

/**
 * Plan the migration: one task per legacy agent, flattened across workspaces.
 *
 * Target name = the agent's own name. On a collision — an existing cloud agent
 * or another task already claiming it — fall back to `"<Agent> (<Workspace>)"`,
 * then `"<Agent> (<Workspace>) 2"`, `… 3`, and so on. Case-insensitive so we
 * never create a cloud agent whose name differs only by case.
 *
 * Resume: a source agent whose `{workspace, agent}` matches an existing cloud
 * agent's import marker is `alreadyDone` — its target is that agent, and its
 * name never counts as a NEW collision (it IS the previous migration).
 */
export function buildMigrationPlan(
  sourceAgents: SourceAgent[],
  existing: ExistingCloudAgent[],
): MigrationTask[] {
  const taken = new Set(existing.map((a) => normalize(a.name)));
  const tasks: MigrationTask[] = [];
  for (const src of sourceAgents) {
    const done = existing.find(
      (a) =>
        a.importedSource &&
        a.importedSource.workspace === src.workspaceId &&
        a.importedSource.agent === src.name,
    );
    if (done) {
      tasks.push({
        sourceId: src.id,
        workspace: src.workspaceId,
        agent: src.name,
        targetName: done.name,
        alreadyDone: true,
        manifest: src.manifest,
      });
      continue;
    }
    let targetName = src.name;
    if (taken.has(normalize(targetName))) {
      const base = `${src.name} (${src.workspaceId})`;
      targetName = base;
      for (let n = 2; taken.has(normalize(targetName)); n++) {
        targetName = `${base} ${n}`;
      }
    }
    taken.add(normalize(targetName));
    tasks.push({
      sourceId: src.id,
      workspace: src.workspaceId,
      agent: src.name,
      targetName,
      alreadyDone: false,
      manifest: src.manifest,
    });
  }
  return tasks;
}

/**
 * Per-request budget of RAW (pre-zip) bytes. The gateway caps a compressed
 * import request at 64 MB, but the binding constraint is reliability, not the
 * cap: each chunk is one long-lived POST on an end-user uplink, and a dropped
 * connection costs the whole request. 16 MB keeps every attempt short (and the
 * per-agent file counter moving) while staying far under the gateway cap even
 * for incompressible content.
 */
export const MAX_CHUNK_RAW_BYTES = 16 * 1024 * 1024;

export interface UploadChunk {
  paths: string[];
  bytes: number;
}

/**
 * Partition manifest entries into upload chunks of at most `maxBytes` summed
 * size. "core" entries (memory, config, history) go in the earliest chunks so
 * the agent is useful even if a later working-file chunk fails. The manifest
 * already excludes single files over its own cap, but an oversized entry is
 * still guarded: it rides alone in its own chunk rather than being dropped.
 */
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

/**
 * Could this existing cloud agent be a previous run's output? Every possible
 * target name starts with a source agent's own name (exact, or
 * `"<Agent> (<Workspace>)…"`), so the resume probe only wakes those pods —
 * probing an unrelated sleeping agent would stall planning on its cold start.
 */
export function isPlausibleMigrationTarget(
  name: string,
  sourceAgents: Pick<SourceAgent, "name">[],
): boolean {
  const n = normalize(name);
  return sourceAgents.some((s) => {
    const base = normalize(s.name);
    return n === base || n.startsWith(`${base} (`);
  });
}

/** Union of every source agent's connected toolkit slugs plus the legacy
 *  account-level list, sorted, for the "reconnect your apps" checklist. */
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

/**
 * The outcome the done screen persists. A clean run is final ("done"); a run
 * that left agents behind stamps "skipped", so the wizard stays closed on
 * relaunch but Settings' "Continue migration" row — which hides only on
 * "done" (`useMigrationAvailable`) — keeps offering the retry.
 */
export function doneScreenOutcome(failedAgents: number): "done" | "skipped" {
  return failedAgents > 0 ? "skipped" : "done";
}

/**
 * Whether the done screen's second step ("Reconnect your apps" + the
 * leftovers report) has anything to show. Modern legacy installs (v0.4.2x)
 * connected integrations in PLATFORM mode — account-level in Composio, no
 * per-agent `.houston/integrations.json` on disk — so the manifest's
 * integration list is empty for them and the step would render as a bare
 * shell. Skip it then; but leftovers (failed agents, excluded/rejected
 * files) must always surface, so any of those keeps the step.
 */
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

// The per-agent progress state machine (pending → … → done | error) lives in
// `cloud-migration-progress.ts`; the wizard's prepare phase (spawn source
// host, scan, resume-probe, plan) in `cloud-migration-prepare.ts`.
