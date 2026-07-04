import { type Dirent, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Per-turn file-change tracking: snapshot the workspace's USER-VISIBLE files
 * before a turn, diff after, and surface what the turn created/modified as a
 * `file_changes` wire frame + `ChatMessage.fileChanges`. Port of the Rust
 * engine's `sessions/file_changes.rs`, sharing its visibility rules so the
 * "files this mission touched" summary behaves identically across engines.
 *
 * Paths are workspace-RELATIVE with `/` separators (portable across the
 * desktop and cloud pods; the frontend renders basenames either way).
 */

/** Directories never walked: build/dep output, plus anything dot-prefixed. */
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

/**
 * Only user-deliverable file types count as "visible" — documents, images,
 * plain text. Code/config files an agent writes as scaffolding never show up
 * in the chat summary. Mirrors the Rust `USER_EXTENSIONS` allowlist.
 */
const USER_EXTENSIONS = new Set([
  "docx",
  "doc",
  "xlsx",
  "xls",
  "pptx",
  "ppt",
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "svg",
  "gif",
  "txt",
  "rtf",
  "csv",
  "md",
  "markdown",
]);

/**
 * Markdown passes the extension gate, but the seeded role files must NOT be
 * reported — otherwise every agent's first session would falsely claim it
 * created its own instructions (Rust test: role files ignored, issue #294).
 */
const HIDDEN_ROLE_FILES = new Set(["claude.md", "agents.md", "gemini.md"]);

type FileState = { size: number; mtimeMs: number };

/** Relative path → size+mtime of every user-visible file under the root. */
export type FileSnapshot = Map<string, FileState>;

export interface FileChanges {
  created: string[];
  modified: string[];
}

function isUserVisible(name: string): boolean {
  if (HIDDEN_ROLE_FILES.has(name.toLowerCase())) return false;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return false;
  return USER_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

function walk(dir: string, rel: string, out: FileSnapshot): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // unreadable dir: treat as empty, never fail the turn
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
    } catch {
      // raced a delete between readdir and stat: skip
    }
  }
}

/** Snapshot the user-visible files under `root`. Never throws on FS races. */
export function snapshotWorkspace(root: string): FileSnapshot {
  const out: FileSnapshot = new Map();
  walk(root, "", out);
  return out;
}

/**
 * What `after` has that `before` didn't (created) or has with a different
 * size/mtime (modified). Deletions are intentionally not reported — same as
 * the Rust diff. Output is sorted for a stable wire/persist shape.
 */
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
