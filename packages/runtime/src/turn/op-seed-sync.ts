import { posix } from "node:path";
import {
  type ObjectStore,
  type SyncResult,
  syncBack,
} from "@houston/runtime-client/object-sync";
import type { SeedTree } from "./op-seed-tree";

export function syncSeedTree(
  store: ObjectStore,
  prefix: string,
  storeRoot: string,
  tree: SeedTree,
): Promise<SyncResult> {
  const root = `${tree.workspaceRel}/`;
  const createOnly: ObjectStore = {
    list: (p) => store.list(p),
    download: (key, dest, opts) => store.download(key, dest, opts),
    upload: (src, key, opts) => store.upload(src, key, opts),
    delete: (key, opts) => store.delete(key, opts),
  };
  return syncBack(createOnly, prefix, storeRoot, new Map(), {
    include: (rel) => rel.startsWith(root),
    holdDeletesOnFailure: true,
    generations: true,
  });
}

export async function withdrawSeedTree(
  store: ObjectStore,
  prefix: string,
  synced: SyncResult,
): Promise<void> {
  for (const rel of synced.uploaded) {
    const generation = synced.manifest.get(rel)?.generation;
    try {
      await store.delete(
        posix.join(prefix, rel),
        generation ? { ifGenerationMatch: generation } : undefined,
      );
    } catch (error) {
      console.warn(
        `[op] seed race: kept ${rel}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
