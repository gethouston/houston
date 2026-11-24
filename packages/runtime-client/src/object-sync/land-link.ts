import { randomUUID } from "node:crypto";
import { lstat, mkdir, rename, rm, symlink } from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import { atomicTempPath } from "@houston/protocol";
import { linkTargetProblem } from "./object-attrs";
import { privateDirOf } from "./private-paths";

const logged = new Set<string>();

export function skipLink(rel: string, problem: string): void {
  const line = `${rel} ${problem}`;
  if (logged.has(line)) return;
  logged.add(line);
  console.error(`[object-sync] link not synced: ${line}`);
}

const MISSING = new Set(["ENOENT"]);
const BLOCKED = new Set(["ENOTDIR", "EEXIST"]);

async function lstatOrMissing(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if (MISSING.has((error as NodeJS.ErrnoException).code ?? ""))
      return undefined;
    throw error;
  }
}

async function parentProblem(
  rel: string,
  destFile: string,
): Promise<string | null> {
  const relPath = rel.split("/").join(sep);
  if (!destFile.endsWith(`${sep}${relPath}`)) return null;
  let folder = destFile.slice(0, -relPath.length - 1);
  for (const segment of rel.split("/").slice(0, -1)) {
    folder = join(folder, segment);
    const info = await lstatOrMissing(folder);
    if (!info) return null;
    if (info.isSymbolicLink()) return "is inside another link";
    if (!info.isDirectory()) return "is inside a file";
  }
  return null;
}

export async function landLink(
  rel: string,
  target: string,
  destFile: string,
): Promise<boolean> {
  const problem = privateDirOf(destFile)
    ? "is in Houston's own folder"
    : (linkTargetProblem(rel, target) ?? (await parentProblem(rel, destFile)));
  if (problem) {
    skipLink(rel, problem);
    return false;
  }
  if ((await lstatOrMissing(destFile))?.isDirectory()) {
    skipLink(rel, "would replace a folder");
    return false;
  }
  const temp = atomicTempPath(destFile, randomUUID());
  try {
    await mkdir(dirname(destFile), { recursive: true });
    await symlink(target, temp);
    await rename(temp, destFile);
  } catch (error) {
    await rm(temp, { force: true });
    if (!BLOCKED.has((error as NodeJS.ErrnoException).code ?? "")) throw error;
    skipLink(rel, "is inside a file");
    return false;
  }
  return true;
}
