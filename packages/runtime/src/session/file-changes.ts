import { type Dirent, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SKIP_DIRS = new Set([
  "node_modules",
  "__pycache__",
  "venv",
  "target",
  "dist",
  "build",
  "skills",
  "scripts",
]);

const HIDDEN_ROLE_FILES = new Set(["claude.md", "agents.md", "gemini.md"]);

type FileState = { size: number; mtimeMs: number };

export type FileSnapshot = Map<string, FileState>;

export interface FileChanges {
  created: string[];
  modified: string[];
}

function isUserVisible(name: string): boolean {
  if (name.startsWith(".")) return false;
  return !HIDDEN_ROLE_FILES.has(name.toLowerCase());
}

function walk(dir: string, rel: string, out: FileSnapshot): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
      walk(join(dir, entry.name), relPath, out);
      continue;
    }
    if (!entry.isFile() || !isUserVisible(entry.name)) continue;
    try {
      const stat = statSync(join(dir, entry.name));
      out.set(relPath, { size: stat.size, mtimeMs: stat.mtimeMs });
    } catch {}
  }
}

export function snapshotWorkspace(root: string): FileSnapshot {
  const out: FileSnapshot = new Map();
  walk(root, "", out);
  return out;
}

export function diffSnapshots(
  before: FileSnapshot,
  after: FileSnapshot,
): FileChanges {
  const created: string[] = [];
  const modified: string[] = [];
  for (const [path, state] of after) {
    const prior = before.get(path);
    if (!prior) created.push(path);
    else if (prior.size !== state.size || prior.mtimeMs !== state.mtimeMs)
      modified.push(path);
  }
  created.sort();
  modified.sort();
  return { created, modified };
}
