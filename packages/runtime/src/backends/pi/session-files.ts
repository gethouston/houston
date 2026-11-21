import { closeSync, openSync, readdirSync, readSync } from "node:fs";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { rotateSessionLog } from "./session-rotation";

export function resumeSessionManager(
  workspaceDir: string,
  sessionDir: string,
  fresh: boolean,
): SessionManager {
  if (!fresh) {
    const newest = newestSessionFile(sessionDir);
    if (newest)
      return SessionManager.open(
        rotateSessionLog(newest, workspaceDir),
        sessionDir,
        workspaceDir,
      );
  }
  return SessionManager.create(workspaceDir, sessionDir);
}

function newestSessionFile(sessionDir: string): string | null {
  let files: string[];
  try {
    files = readdirSync(sessionDir).filter((f) => f.endsWith(".jsonl"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  files.sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const candidate = join(sessionDir, files[i] as string);
    if (isReadableSession(candidate)) return candidate;
  }
  return null;
}

export function hasUnreadablePiSessionTail(sessionDir: string): boolean {
  let hasSessionFile = false;
  try {
    hasSessionFile = readdirSync(sessionDir).some((file) =>
      file.endsWith(".jsonl"),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return hasSessionFile && newestSessionFile(sessionDir) === null;
}

function isReadableSession(file: string): boolean {
  const buffer = Buffer.alloc(64 * 1024);
  let descriptor: number;
  try {
    descriptor = openSync(file, "r");
  } catch {
    return false;
  }
  try {
    const bytes = readSync(descriptor, buffer, 0, buffer.length, 0);
    const head = buffer.toString("utf8", 0, bytes).split("\n", 1)[0] as string;
    if (!head) return false;
    const parsed = JSON.parse(head) as { type?: unknown };
    return parsed.type === "session";
  } catch {
    return false;
  } finally {
    closeSync(descriptor);
  }
}
