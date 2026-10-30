import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { atomicTempPath, isAtomicTemp } from "@houston/protocol";

/**
 * Where a tool result too big to keep in the model's context goes, so the
 * model can still read all of it with its ordinary file tool.
 *
 * Inside the agent folder because that is the only place the model's file
 * tools may read, and because on cloud turns the folder is what the store
 * syncs, so a result saved on one turn is readable on the next. A dot folder:
 * the Files tab hides it, and the store hydrates it behind the prompt like
 * every other agent folder, never on the turn's critical path.
 *
 * The folder is bounded ({@link SPILL_BUDGET_BYTES}) so a long-lived agent
 * does not sync an ever-growing pile. Oldest files go first; a pointer to a
 * pruned file only costs the model a re-run of the tool.
 */
export const SPILL_DIR = ".tool-results";

const SPILL_BUDGET_BYTES = 16 * 1024 * 1024;

/** Where one spilled result goes, relative to the agent folder. */
export interface SpillTarget {
  workspaceDir: string;
  conversationId: string;
}

/**
 * Save `text` and return its path relative to the agent folder. Named by the
 * content's hash, so saving the same result again is free and returns the same
 * path: the pointer the model sees never changes between requests.
 */
export function spillToolResult(
  target: SpillTarget,
  toolName: string,
  text: string,
): string {
  const digest = createHash("sha256").update(text).digest("hex").slice(0, 16);
  const rel = `${SPILL_DIR}/${safeSegment(target.conversationId)}/${safeSegment(toolName)}-${digest}.txt`;
  const abs = join(target.workspaceDir, rel);
  if (existsSync(abs)) return rel;
  mkdirSync(join(abs, ".."), { recursive: true });
  const tmp = atomicTempPath(abs, randomUUID());
  writeFileSync(tmp, text);
  renameSync(tmp, abs);
  pruneSpills(target.workspaceDir, abs);
  return rel;
}

function safeSegment(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80) || "_";
}

/** Delete the oldest spilled results, never `keep`, until the folder fits. */
function pruneSpills(workspaceDir: string, keep: string): void {
  const root = join(workspaceDir, SPILL_DIR);
  const files: { path: string; bytes: number; mtimeMs: number }[] = [];
  for (const dir of readdirSync(root)) {
    const dirPath = join(root, dir);
    if (!statSync(dirPath).isDirectory()) continue;
    for (const name of readdirSync(dirPath)) {
      const path = join(dirPath, name);
      if (isAtomicTemp(name)) continue;
      const { size, mtimeMs } = statSync(path);
      files.push({ path, bytes: size, mtimeMs });
    }
  }
  let total = files.reduce((sum, f) => sum + f.bytes, 0);
  if (total <= SPILL_BUDGET_BYTES) return;
  files.sort((a, b) => a.mtimeMs - b.mtimeMs);
  for (const file of files) {
    if (total <= SPILL_BUDGET_BYTES) break;
    if (file.path === keep) continue;
    rmSync(file.path, { force: true });
    total -= file.bytes;
    const dir = join(file.path, "..");
    if (readdirSync(dir).length === 0) rmdirSync(dir);
  }
}
