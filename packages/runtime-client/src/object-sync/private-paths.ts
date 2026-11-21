import { constants, type Stats } from "node:fs";
import { lstat, mkdir, open } from "node:fs/promises";
import { dirname } from "node:path";

const PRIVATE_DIR = /^((?:.*[\\/])?\.houston[\\/]browser)[\\/][^\\/]/i;

export const PRIVATE_FILE_MODE = 0o600;
export const PRIVATE_DIR_MODE = 0o700;

const WINDOWS = process.platform === "win32";

export function privateDirOf(file: string): string | undefined {
  return PRIVATE_DIR.exec(file)?.[1];
}

export function landingMode(file: string): { mode?: number } {
  return privateDirOf(file) ? { mode: PRIVATE_FILE_MODE } : {};
}

export function currentUid(): number | undefined {
  return WINDOWS ? undefined : process.getuid?.();
}

function problemWith(info: Stats, uid: number | undefined): string | null {
  if (info.isSymbolicLink()) return "is a symlink";
  if (!info.isDirectory()) return "is not a directory";
  if (uid !== undefined && info.uid !== uid)
    return `is owned by uid ${info.uid}, not this process (${uid})`;
  return null;
}

export async function closePrivateDir(
  file: string,
  uid: number | undefined = currentUid(),
): Promise<boolean> {
  const dir = privateDirOf(file);
  if (!dir) return true;
  const problem = await privateDirProblem(dir, uid, true);
  if (problem === null) return true;
  console.error(
    `[object-sync] refusing to write sign-in state: ${dir} ${problem}`,
  );
  return false;
}

export async function privateDirProblem(
  dir: string,
  uid: number | undefined = currentUid(),
  close = false,
): Promise<string | null> {
  if (WINDOWS) return problemWith(await lstat(dir), uid);
  return checkThroughDescriptor(dir, uid, close);
}

async function checkThroughDescriptor(
  dir: string,
  uid: number | undefined,
  close: boolean,
): Promise<string | null> {
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(
      dir,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ELOOP") return "is a symlink";
    if (code === "ENOTDIR") return "is not a directory";
    if (code === "EACCES" || code === "EPERM") return "is not ours to open";
    throw error;
  }
  try {
    const problem = problemWith(await handle.stat(), uid);
    if (problem === null && close) await handle.chmod(PRIVATE_DIR_MODE);
    return problem;
  } finally {
    await handle.close();
  }
}

export async function mkdirForLanding(file: string): Promise<boolean> {
  const dir = privateDirOf(file);
  if (!dir) {
    await mkdir(dirname(file), { recursive: true });
    return true;
  }
  await mkdir(dirname(dir), { recursive: true });
  try {
    await mkdir(dir, { mode: PRIVATE_DIR_MODE });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  if (!(await closePrivateDir(file))) return false;
  await mkdir(dirname(file), { recursive: true, mode: PRIVATE_DIR_MODE });
  return true;
}
