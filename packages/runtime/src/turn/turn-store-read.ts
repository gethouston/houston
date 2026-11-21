import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix } from "node:path";
import { decodeText } from "@houston/host/src/vfs";
import {
  ObjectNotFoundError,
  type ObjectStore,
} from "@houston/runtime-client/object-sync";

export const STORE_READ_TIMEOUT_MS = 15_000;

export async function readStoreText(
  source: { store: ObjectStore; prefix: string },
  rel: string,
  timeoutMs = STORE_READ_TIMEOUT_MS,
): Promise<string | null> {
  const dir = await mkdtemp(join(tmpdir(), "houston-store-read-"));
  try {
    const file = join(dir, "object");
    await source.store.download(
      source.prefix ? posix.join(source.prefix, rel) : rel,
      file,
      { signal: AbortSignal.timeout(timeoutMs) },
    );
    return decodeText(await readFile(file));
  } catch (error) {
    if (error instanceof ObjectNotFoundError) return null;
    throw error;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
