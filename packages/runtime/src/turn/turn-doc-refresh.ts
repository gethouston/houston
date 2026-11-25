import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import { atomicTempPath } from "@houston/protocol";
import {
  keepsMergeBase,
  mergeDocumentBodies,
  mergeOverDeleted,
  ObjectNotFoundError,
  type ObjectStore,
  trustedBase,
} from "@houston/runtime-client/object-sync";
import type { TurnFilesystem } from "./turn-filesystem";

export interface DocRefreshTarget {
  store: ObjectStore;
  prefix: string;
  filesystem: TurnFilesystem;
  relativePath: string;
}

export function remoteKey(prefix: string, relativePath: string): string {
  return prefix ? posix.join(prefix, relativePath) : relativePath;
}

// WHY: Manifest keeps the remote bytes as base; unsaved merged bytes must never become one. ADR-0015
export async function refreshDocument(
  opts: DocRefreshTarget,
): Promise<{ generation?: string; refreshable: boolean }> {
  const key = remoteKey(opts.prefix, opts.relativePath);
  const local = join(
    opts.filesystem.storeRoot,
    ...opts.relativePath.split("/"),
  );
  let localBody: string | undefined;
  try {
    localBody = await readFile(local, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const gone = async () => {
    const base = trustedBase(opts.filesystem.manifest.get(opts.relativePath));
    if (localBody !== undefined) {
      try {
        const merged = mergeOverDeleted(opts.relativePath, localBody, base);
        if (merged !== undefined) await writeFile(local, merged);
      } catch (error) {
        console.warn(
          `[turn-doc-cas] ${opts.relativePath} unmergeable over its deletion, local copy kept: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    opts.filesystem.manifest.delete(opts.relativePath);
    return { refreshable: true };
  };
  let generation: string | undefined;
  const versionedRead = opts.store.downloadVersioned !== undefined;
  const remoteTemp = atomicTempPath(local, `${randomUUID()}.remote`);
  try {
    if (opts.store.downloadVersioned) {
      generation = (await opts.store.downloadVersioned(key, remoteTemp))
        .generation;
    } else if (opts.store.manifest) {
      const object = (await opts.store.manifest(opts.prefix)).find(
        (entry) => entry.key === key,
      );
      if (!object) return gone();
      generation = object.generation;
      await opts.store.download(key, remoteTemp);
    } else {
      return {
        generation: opts.filesystem.manifest.get(opts.relativePath)?.generation,
        refreshable: false,
      };
    }
  } catch (error) {
    await rm(remoteTemp, { force: true });
    if (!(error instanceof ObjectNotFoundError)) throw error;
    return gone();
  }
  let remote: Buffer;
  try {
    remote = await readFile(remoteTemp);
    await mkdir(dirname(local), { recursive: true });
    const merged =
      localBody === undefined
        ? undefined
        : mergeDocumentBodies(
            opts.relativePath,
            localBody,
            remote.toString("utf8"),
            trustedBase(opts.filesystem.manifest.get(opts.relativePath)),
          );
    await writeFile(local, merged ?? remote);
  } finally {
    await rm(remoteTemp, { force: true });
  }
  opts.filesystem.manifest.set(opts.relativePath, {
    hash: createHash("sha256").update(remote).digest("hex"),
    generation,
    ...(keepsMergeBase(opts.relativePath)
      ? { mergeBase: remote.toString("utf8") }
      : {}),
  });
  return {
    generation,
    refreshable: !versionedRead || generation !== undefined,
  };
}
