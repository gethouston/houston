import { createHash } from "node:crypto";
import { lstat, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileSha256 } from "./file-hash";
import { contentHash, isExecutable } from "./object-attrs";
import { readPrivateFile } from "./private-file";
import { PRIVATE_FILE_MODE, privateDirOf } from "./private-paths";
import { linkSource, type RefusedLink } from "./sync-back-link-source";

export interface SyncSource {
  hash: string;
  size: number;
  path: string;
  link?: true;
  dispose(): Promise<void>;
}

export const SOURCE_GONE = "gone";
export const SOURCE_REFUSED = "refused";

const STATE_FILE = "state.json";

const logged = new Set<string>();

const kept = async () => {};

export async function syncSource(
  abs: string,
  rel: string,
): Promise<
  SyncSource | RefusedLink | typeof SOURCE_GONE | typeof SOURCE_REFUSED
> {
  if (privateDirOf(abs)) return privateSource(abs);
  try {
    const info = await lstat(abs);
    if (info.isSymbolicLink()) return linkSource(abs, rel);
    if (!info.isFile()) return SOURCE_GONE;
    const sha = await fileSha256(abs, info.size);
    const hash = contentHash(sha, isExecutable(info.mode));
    return { hash, size: info.size, path: abs, dispose: kept };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return SOURCE_GONE;
    throw err;
  }
}

function refuse(abs: string, problem: string): typeof SOURCE_REFUSED {
  const line = `${abs} ${problem}`;
  if (!logged.has(line)) {
    logged.add(line);
    console.error(`[object-sync] not syncing sign-in state: ${line}`);
  }
  return SOURCE_REFUSED;
}

function isStorageState(body: Buffer): boolean {
  try {
    const state: unknown = JSON.parse(body.toString("utf8"));
    if (typeof state !== "object" || state === null) return false;
    const { cookies, origins } = state as Record<string, unknown>;
    return Array.isArray(cookies) && Array.isArray(origins);
  } catch {
    return false;
  }
}

async function privateSource(
  abs: string,
): Promise<SyncSource | typeof SOURCE_GONE | typeof SOURCE_REFUSED> {
  if (basename(abs) !== STATE_FILE)
    return refuse(abs, "is not the browser's state file");
  const read = await readPrivateFile(abs);
  if (read.kind === "missing") return SOURCE_GONE;
  if (read.kind === "refused") return refuse(abs, read.problem);
  if (!isStorageState(read.body))
    return refuse(abs, "is not a browser storage state");
  const dir = await mkdtemp(join(tmpdir(), "houston-private-sync-"));
  const dispose = () => rm(dir, { recursive: true, force: true });
  try {
    const path = join(dir, "object");
    await writeFile(path, read.body, { mode: PRIVATE_FILE_MODE, flag: "wx" });
    const hash = createHash("sha256").update(read.body).digest("hex");
    return { hash, size: read.body.length, path, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}
