import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { atomicTempPath } from "@houston/protocol";
import {
  closePrivateDir,
  PRIVATE_DIR_MODE,
  PRIVATE_FILE_MODE,
  privateDirProblem,
  readPrivateFile,
} from "@houston/runtime-client/object-sync";
import type { BrowserContext } from "playwright-core";
import {
  EMPTY_STATE,
  isStorageState,
  mergeStorageState,
  type StorageState,
} from "./state-merge";

export function browserStatePath(workspaceDir: string): string {
  return join(workspaceDir, ".houston", "browser", "state.json");
}

const refusedLogged = new Set<string>();

export async function readState(
  path: string,
): Promise<StorageState | undefined> {
  if (!(await stateDirTrusted(dirname(path)))) return undefined;
  const read = await readPrivateFile(path);
  if (read.kind === "missing") return undefined;
  if (read.kind === "refused") {
    logRefusal(path, read.problem);
    return undefined;
  }
  const raw = read.body.toString("utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.warn(
      `[browser] ignoring unreadable sign-in state at ${path}`,
      error,
    );
    return undefined;
  }
  if (isStorageState(parsed)) return parsed;
  console.warn(`[browser] ignoring malformed sign-in state at ${path}`);
  return undefined;
}

async function stateDirTrusted(dir: string): Promise<boolean> {
  let problem: string | null;
  try {
    problem = await privateDirProblem(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  if (problem === null) return true;
  logRefusal(dir, problem);
  return false;
}

function logRefusal(path: string, problem: string): void {
  if (refusedLogged.has(`${path} ${problem}`)) return;
  refusedLogged.add(`${path} ${problem}`);
  console.error(`[browser] not reading sign-in state: ${path} ${problem}`);
}

export interface StateHolder {
  context: BrowserContext;
  statePath: string;
  base: StorageState;
  scope?: (state: StorageState) => StorageState;
}

const saving = new Map<string, Promise<void>>();

export function saveState(holder: StateHolder): Promise<void> {
  const path = holder.statePath;
  const previous = saving.get(path) ?? Promise.resolve();
  const next = previous.then(() => writeMerged(holder));
  const release = () => {
    if (saving.get(path) === settled) saving.delete(path);
  };
  const settled: Promise<void> = next.then(release, release);
  saving.set(path, settled);
  return next;
}

async function writeMerged(holder: StateHolder): Promise<void> {
  const all = await holder.context.storageState({ indexedDB: true });
  const ours = holder.scope ? holder.scope(all) : all;
  const theirs = (await readState(holder.statePath)) ?? EMPTY_STATE;
  const merged = mergeStorageState(holder.base, ours, theirs);
  if (!(await ensureStateDir(holder.statePath))) return;
  const tmp = atomicTempPath(
    holder.statePath,
    `${process.pid}-${crypto.randomUUID()}`,
  );
  await writeFile(tmp, JSON.stringify(merged), {
    mode: PRIVATE_FILE_MODE,
    flag: "wx",
  });
  await rename(tmp, holder.statePath);
  holder.base = ours;
}

async function ensureStateDir(statePath: string): Promise<boolean> {
  try {
    await mkdir(dirname(statePath), { mode: PRIVATE_DIR_MODE });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      console.warn("[browser] the workspace is gone; sign-ins not saved");
      return false;
    }
    if (code !== "EEXIST") throw error;
  }
  return closePrivateDir(statePath);
}
