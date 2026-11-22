import { randomUUID } from "node:crypto";
import { lstat, mkdir, rename, rm, symlink } from "node:fs/promises";
import { dirname } from "node:path";
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

export async function landLink(
  rel: string,
  target: string,
  destFile: string,
): Promise<boolean> {
  const problem = privateDirOf(destFile)
    ? "is in Houston's own folder"
    : linkTargetProblem(rel, target);
  if (problem) {
    skipLink(rel, problem);
    return false;
  }
  const existing = await lstat(destFile).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  });
  if (existing?.isDirectory()) {
    skipLink(rel, "would replace a folder");
    return false;
  }
  await mkdir(dirname(destFile), { recursive: true });
  const temp = atomicTempPath(destFile, randomUUID());
  try {
    await symlink(target, temp);
    await rename(temp, destFile);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
  return true;
}
