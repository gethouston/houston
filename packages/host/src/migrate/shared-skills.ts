import {
  loadSkillsManifest,
  saveSkillsManifest,
  sharedSkillsDirKey,
  skillDirKeyInDir,
  skillKey,
  skillsDirKey,
  withSharedSkill,
} from "@houston/domain";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import type { WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";

interface SkillSnapshot {
  agent: Agent;
  root: string;
  files: { relative: string; bytes: Buffer }[];
}

export interface SharedSkillsMigrationResult {
  sharedSkillsCreated: number;
  agentCopiesRemoved: number;
}

/** Collapse byte-identical agent skill directories into one workspace copy. */
export async function migrateSharedSkills(opts: {
  store: WorkspaceStore;
  vfs: Vfs;
  paths: WorkspacePaths;
  log?: (line: string) => void;
}): Promise<SharedSkillsMigrationResult> {
  const result: SharedSkillsMigrationResult = {
    sharedSkillsCreated: 0,
    agentCopiesRemoved: 0,
  };
  const workspaces = (await opts.store.listWorkspaces()).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  for (const workspace of workspaces) {
    await migrateWorkspace(opts, workspace, result);
  }
  (opts.log ?? console.log)(
    `[shared-skills] created ${result.sharedSkillsCreated} shared skill(s), removed ${result.agentCopiesRemoved} identical agent copy/copies`,
  );
  return result;
}

async function migrateWorkspace(
  opts: {
    store: WorkspaceStore;
    vfs: Vfs;
    paths: WorkspacePaths;
  },
  workspace: Workspace,
  result: SharedSkillsMigrationResult,
): Promise<void> {
  const bySlug = new Map<string, SkillSnapshot[]>();
  const agents = (await opts.store.listAgents(workspace.id)).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  for (const agent of agents) {
    for (const [slug, snapshot] of await snapshotsForAgent(
      opts.vfs,
      opts.paths,
      workspace,
      agent,
    )) {
      const group = bySlug.get(slug) ?? [];
      group.push(snapshot);
      bySlug.set(slug, group);
    }
  }

  const sharedDir = sharedSkillsDirKey(opts.paths.sharedRoot(workspace));
  for (const [slug, snapshots] of [...bySlug].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if ((await opts.vfs.list(skillDirKeyInDir(sharedDir, slug))).length > 0)
      continue;
    const identical = largestIdenticalGroup(snapshots);
    if (identical.length < 2) continue;

    for (const file of identical[0]?.files ?? []) {
      await opts.vfs.writeBytes(
        `${skillDirKeyInDir(sharedDir, slug)}/${file.relative}`,
        file.bytes,
      );
    }
    for (const snapshot of identical) {
      const manifest = await loadSkillsManifest(opts.vfs, snapshot.root);
      await saveSkillsManifest(
        opts.vfs,
        snapshot.root,
        withSharedSkill(manifest, slug, true),
      );
    }
    for (const snapshot of identical) {
      await opts.vfs.deletePrefix(
        skillDirKeyInDir(skillsDirKey(snapshot.root), slug),
      );
      result.agentCopiesRemoved++;
    }
    result.sharedSkillsCreated++;
  }
}

async function snapshotsForAgent(
  vfs: Vfs,
  paths: WorkspacePaths,
  workspace: Workspace,
  agent: Agent,
): Promise<Map<string, SkillSnapshot>> {
  const root = paths.agentRoot(workspace, agent);
  const dir = skillsDirKey(root);
  const keys = await vfs.list(dir);
  const slugs = [
    ...new Set(
      keys
        .map((key) => key.slice(dir.length + 1).split("/")[0] ?? "")
        .filter(Boolean),
    ),
  ].sort();
  const snapshots = new Map<string, SkillSnapshot>();
  for (const slug of slugs) {
    if ((await vfs.readBytes(skillKey(root, slug))) === null) continue;
    const prefix = skillDirKeyInDir(dir, slug);
    const files: SkillSnapshot["files"] = [];
    for (const key of await vfs.list(prefix)) {
      const bytes = await vfs.readBytes(key);
      if (bytes === null)
        throw new Error(`shared-skills migration source disappeared: ${key}`);
      files.push({ relative: key.slice(prefix.length + 1), bytes });
    }
    snapshots.set(slug, { agent, root, files });
  }
  return snapshots;
}

function largestIdenticalGroup(snapshots: SkillSnapshot[]): SkillSnapshot[] {
  const groups: SkillSnapshot[][] = [];
  for (const snapshot of snapshots) {
    const group = groups.find((candidate) =>
      sameFiles(candidate[0]?.files ?? [], snapshot.files),
    );
    if (group) group.push(snapshot);
    else groups.push([snapshot]);
  }
  return (
    groups.sort(
      (a, b) =>
        b.length - a.length ||
        (a[0]?.agent.id ?? "").localeCompare(b[0]?.agent.id ?? ""),
    )[0] ?? []
  );
}

function sameFiles(
  left: SkillSnapshot["files"],
  right: SkillSnapshot["files"],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (file, index) =>
        file.relative === right[index]?.relative &&
        file.bytes.equals(right[index]?.bytes),
    )
  );
}
