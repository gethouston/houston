import { statSync } from "node:fs";
import type { ClaudeOAuthCredential } from "@houston/runtime-client";
import { readClaudeOAuthCredentialFile } from "./credentials-file";

/**
 * THE SHARED LOGIN FILE, PARSED ONCE PER CHANGE — the read side of
 * `<HOUSTON_HOME>/claude-login/.credentials.json` (see shared-login.ts for what
 * that file is).
 *
 * This resolution runs on every credential read of a turn — prompt preparation,
 * the summarizer, the anonymizer, each cache lookup — and each one used to open,
 * read and JSON-parse the file again. `statSync` is a single cheap syscall, and
 * identity (inode) + size + mtime together settle whether the bytes can have
 * moved: the writers are atomic tmp+rename (a NEW inode every time), so a
 * same-millisecond rewrite of the same length still invalidates. Only the parse
 * is cached — whether the credential can still authenticate a turn is a question
 * about NOW, re-asked by every caller (shared-login.ts).
 */

/** The last parse, with the file identity it was taken from. */
let cached:
  | {
      path: string;
      ino: number;
      size: number;
      mtimeMs: number;
      cred: ClaudeOAuthCredential | undefined;
    }
  | undefined;

/** Test seam: forget the parsed file (tests rewrite it in place, in one tick). */
export function forgetSharedLoginCacheForTest(): void {
  cached = undefined;
}

/** The credential `path` carries, or undefined when it holds none we can use. */
export function readSharedLoginFile(
  path: string,
): ClaudeOAuthCredential | undefined {
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(path);
  } catch {
    // Absent (the common case: no login on this machine) or unreadable — the
    // read below would answer undefined anyway, and nothing is worth caching.
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
