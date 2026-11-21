import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { atomicTempPath, isAtomicTemp } from "@houston/protocol";

export const SPILL_DIR = ".tool-results";

const SPILL_BUDGET_BYTES = 16 * 1024 * 1024;

export interface SpillTarget {
  workspaceDir: string;
  conversationId: string;
}

export interface SpillImage {
  data: string;
  mimeType: string;
}

export function spillToolResult(
  target: SpillTarget,
  toolName: string,
  text: string,
): string {
  return saveSpill(target, toolName, "txt", text);
}

export function spillToolResultParts(
  target: SpillTarget,
  toolName: string,
  text: string,
  images: readonly SpillImage[],
): string[] {
  return [
    ...(text ? [spillToolResult(target, toolName, text)] : []),
    ...images.map((image) =>
      saveSpill(
        target,
        toolName,
        IMAGE_EXTENSIONS[image.mimeType] ?? "bin",
        Buffer.from(image.data, "base64"),
      ),
    ),
  ];
}

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

function saveSpill(
  target: SpillTarget,
  toolName: string,
  extension: string,
  content: string | Buffer,
): string {
  const digest = createHash("sha256")
    .update(content)
    .digest("hex")
    .slice(0, 16);
  const rel = `${SPILL_DIR}/${safeSegment(target.conversationId)}/${safeSegment(toolName)}-${digest}.${extension}`;
  const abs = join(target.workspaceDir, rel);
  if (existsSync(abs)) {
    const now = new Date();
    utimesSync(abs, now, now);
    return rel;
  }
  mkdirSync(join(abs, ".."), { recursive: true });
  const tmp = atomicTempPath(abs, randomUUID());
  writeFileSync(tmp, content);
  renameSync(tmp, abs);
  pruneSpills(target.workspaceDir, abs);
  return rel;
}

function safeSegment(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80) || "_";
}

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
