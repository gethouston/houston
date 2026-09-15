import { VfsReadOnlyError } from "./vfs";

/**
 * The errnos a storage that refuses writes answers with: a read-only mount
 * (EROFS), a directory the process may not write (EACCES), an owner/flag
 * refusal (EPERM — macOS `uchg`, a Windows ACL through Node's mapping).
 */
const REFUSES_WRITES: ReadonlySet<string> = new Set([
  "EACCES",
  "EPERM",
  "EROFS",
]);

/**
 * Run a write primitive, naming a storage that refuses writes as its own state
 * instead of letting a raw errno reach the route as a 500.
 *
 * One wrapper at the port covers every writer at once — the Files tab's
 * delete, rename, upload and folder create, the skills saves, the `.houston/`
 * document writes — which is what a per-caller errno check could not: it would
 * cover whichever caller someone remembered. The original error stays as
 * `cause`, so the log and Sentry still get the syscall and the path.
 */
export async function writable<T>(
  key: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code && REFUSES_WRITES.has(code)) {
      throw new VfsReadOnlyError(key, { cause: err });
    }
    throw err;
  }
}
