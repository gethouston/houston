import { statSync } from "node:fs";
import type { ClaudeOAuthCredential } from "@houston/runtime-client";
import { readClaudeOAuthCredentialFile } from "./credentials-file";

let cached:
  | {
      path: string;
      ino: number;
      size: number;
      mtimeMs: number;
      cred: ClaudeOAuthCredential | undefined;
    }
  | undefined;

export function forgetSharedLoginCacheForTest(): void {
  cached = undefined;
}

// WHY: Writers replace via atomic rename; size and mtime can match, so the inode is in the key. ADR-0009
export function readSharedLoginFile(
  path: string,
): ClaudeOAuthCredential | undefined {
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(path);
  } catch {
    cached = undefined;
    return undefined;
  }
  if (
    cached &&
    cached.path === path &&
    cached.ino === stat.ino &&
    cached.size === stat.size &&
    cached.mtimeMs === stat.mtimeMs
  ) {
    return cached.cred;
  }
  const cred = readClaudeOAuthCredentialFile(path);
  cached = {
    path,
    ino: stat.ino,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    cred,
  };
  return cred;
}
