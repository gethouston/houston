import { mkdir, rm, stat } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import {
  fileSha256,
  ObjectNotFoundError,
  type ObjectStore,
  StoreConflictError,
} from "@houston/runtime-client/object-sync";
import type { TurnFilesystem } from "./turn-filesystem";

const MAX_ATTEMPTS = 3;

/** A document remained concurrently modified across every bounded CAS attempt. */
export class TurnDocConflictError extends Error {
  readonly code = "document_conflict";

  constructor(readonly relativePath: string) {
    super(`document changed during this turn: ${relativePath}`);
    this.name = "TurnDocConflictError";
  }
}

/** Dependencies and mutation callback for one guarded document write. */
export interface TurnDocCasOptions<T> {
  store: ObjectStore;
  prefix: string;
  filesystem: TurnFilesystem;
  relativePath: string;
  apply: () => Promise<T>;
  shouldCommit?: (result: T) => boolean;
}

function remoteKey(prefix: string, relativePath: string): string {
  return prefix ? posix.join(prefix, relativePath) : relativePath;
}

async function refreshDocument<T>(
  opts: TurnDocCasOptions<T>,
): Promise<string | undefined> {
  if (!opts.store.manifest) {
    return opts.filesystem.manifest.get(opts.relativePath)?.generation;
  }
  const key = remoteKey(opts.prefix, opts.relativePath);
  const object = (await opts.store.manifest(opts.prefix)).find(
    (entry) => entry.key === key,
  );
  const local = join(
    opts.filesystem.storeRoot,
    ...opts.relativePath.split("/"),
  );
  if (!object) {
    await rm(local, { force: true });
    opts.filesystem.manifest.delete(opts.relativePath);
    return undefined;
  }
  await mkdir(dirname(local), { recursive: true });
  try {
    await opts.store.download(key, local);
  } catch (error) {
    if (!(error instanceof ObjectNotFoundError)) throw error;
    await rm(local, { force: true });
    opts.filesystem.manifest.delete(opts.relativePath);
    return undefined;
  }
  const info = await stat(local);
  opts.filesystem.manifest.set(opts.relativePath, {
    hash: await fileSha256(local, info.size),
    generation: object.generation,
  });
  return object.generation;
}

/** Re-read, re-apply, and generation-guard one document mutation up to three times. */
export async function mutateTurnDocument<T>(
  opts: TurnDocCasOptions<T>,
): Promise<T> {
  const key = remoteKey(opts.prefix, opts.relativePath);
  const local = join(
    opts.filesystem.storeRoot,
    ...opts.relativePath.split("/"),
  );
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const generation = await refreshDocument(opts);
    const result = await opts.apply();
    if (opts.shouldCommit && !opts.shouldCommit(result)) return result;
    const info = await stat(local);
    try {
      const uploaded = await opts.store.upload(local, key, {
        ifGenerationMatch: generation ?? "0",
      });
      opts.filesystem.manifest.set(opts.relativePath, {
        hash: await fileSha256(local, info.size),
        generation: uploaded?.generation ?? generation,
      });
      opts.filesystem.immediateWrites.add(opts.relativePath);
      return result;
    } catch (error) {
      if (!(error instanceof StoreConflictError)) throw error;
    }
  }
  throw new TurnDocConflictError(opts.relativePath);
}
