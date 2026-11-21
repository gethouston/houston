import { constants, type Stats } from "node:fs";
import { type FileHandle, lstat, open } from "node:fs/promises";
import { currentUid } from "./private-paths";

export type PrivateFileRead =
  | { kind: "read"; body: Buffer }
  | { kind: "missing" }
  | { kind: "refused"; problem: string };

const WINDOWS = process.platform === "win32";
const NO_FOLLOW = WINDOWS ? 0 : (constants.O_NOFOLLOW ?? 0);
const NON_BLOCK = WINDOWS ? 0 : (constants.O_NONBLOCK ?? 0);

function problemWith(info: Stats, uid: number | undefined): string | null {
  if (!info.isFile()) return "is not a regular file";
  if (uid !== undefined && info.uid !== uid)
    return `is owned by uid ${info.uid}, not this process (${uid})`;
  if (info.nlink !== 1) return `has ${info.nlink} hard links`;
  return null;
}

export async function readPrivateFile(
  file: string,
  uid: number | undefined = currentUid(),
): Promise<PrivateFileRead> {
  let handle: FileHandle;
  try {
    if (NO_FOLLOW === 0 && (await lstat(file)).isSymbolicLink())
      return { kind: "refused", problem: "is a symlink" };
    handle = await open(file, constants.O_RDONLY | NO_FOLLOW | NON_BLOCK);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { kind: "missing" };
    if (code === "ENOTDIR")
      return { kind: "refused", problem: "is not under a directory" };
    if (code === "ELOOP" || code === "EMLINK")
      return { kind: "refused", problem: "is a symlink" };
    if (code === "EACCES" || code === "EPERM")
      return { kind: "refused", problem: "is not ours to open" };
    throw error;
  }
  try {
    const problem = problemWith(await handle.stat(), uid);
    if (problem !== null) return { kind: "refused", problem };
    return { kind: "read", body: await handle.readFile() };
  } finally {
    await handle.close();
  }
}
