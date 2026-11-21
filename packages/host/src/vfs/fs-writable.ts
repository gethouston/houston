import { VfsReadOnlyError } from "./vfs";

const REFUSES_WRITES: ReadonlySet<string> = new Set([
  "EACCES",
  "EPERM",
  "EROFS",
]);

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
