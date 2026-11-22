import { readlink } from "node:fs/promises";
import { linkHash, linkTargetProblem } from "./object-attrs";
import type { SyncSource } from "./sync-back-source";

export interface RefusedLink {
  refusedLink: string;
}

const kept = async () => {};

export async function linkSource(
  abs: string,
  rel: string,
): Promise<SyncSource | RefusedLink | "gone"> {
  let target: string;
  try {
    target = await readlink(abs);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "gone";
    throw error;
  }
  const problem = linkTargetProblem(rel, target);
  if (problem) return { refusedLink: `link ${problem}` };
  return {
    hash: linkHash(target),
    size: Buffer.byteLength(target),
    path: abs,
    link: true,
    dispose: kept,
  };
}
