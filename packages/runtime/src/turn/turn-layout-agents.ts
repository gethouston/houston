import type { Dirent } from "node:fs";
import { access, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { PREFERENCES_NAMESPACE } from "@houston/domain";

async function readEntries(path: string): Promise<Dirent[]> {
  try {
    return await readdir(path, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw error;
  }
}

const directories = (entries: Dirent[]) =>
  entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."));

export async function standingTree(
  storeRoot: string,
): Promise<{ present: boolean; candidates: string[] }> {
  const workspacesRoot = join(storeRoot, "workspaces");
  const entries = (await readEntries(workspacesRoot)).filter(
    (entry) => entry.name !== PREFERENCES_NAMESPACE,
  );
  const agents = await Promise.all(
    directories(entries).map(async (workspace) =>
      directories(await readEntries(join(workspacesRoot, workspace.name))).map(
        (agent) => join(workspacesRoot, workspace.name, agent.name),
      ),
    ),
  );
  return { present: entries.length > 0, candidates: agents.flat() };
}

const AGENT_MARKER_FILES = [
  "CLAUDE.md",
  ".houston/activity/activity.json",
  ".houston/config/config.json",
];
const AGENT_MARKER_DIRS = [".agents/skills/"];

function listedMarker(agentRel: string, listed: readonly string[]): boolean {
  const root = `${agentRel}/`;
  return listed.some((rel) => {
    if (!rel.startsWith(root)) return false;
    const inner = rel.slice(root.length);
    return (
      AGENT_MARKER_FILES.includes(inner) ||
      AGENT_MARKER_DIRS.some((dir) => inner.startsWith(dir))
    );
  });
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function onDiskMarker(agentDir: string): Promise<boolean> {
  const markers = [...AGENT_MARKER_FILES, ...AGENT_MARKER_DIRS];
  const found = await Promise.all(
    markers.map((marker) => exists(join(agentDir, ...marker.split("/")))),
  );
  return found.includes(true);
}

export async function realAgents(
  storeRoot: string,
  candidates: string[],
  listed: readonly string[],
): Promise<string[]> {
  const real = await Promise.all(
    candidates.map(async (agentDir) => {
      const agentRel = relative(storeRoot, agentDir).split(sep).join("/");
      return listedMarker(agentRel, listed) || (await onDiskMarker(agentDir));
    }),
  );
  return candidates.filter((_, index) => real[index]);
}
