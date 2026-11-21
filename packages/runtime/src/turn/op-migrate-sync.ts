import {
  type HydrateManifest,
  type ObjectStore,
  syncBack,
} from "@houston/runtime-client/object-sync";
import { migrateScope, PREFERENCES_PREFIX } from "./op-migrate-tree";

export type MigrateSync =
  | { durable: true; uploaded: string[]; deleted: string[] }
  | { durable: false; conflicts: string[]; skipped: string[] };

export async function syncMigratedTree(input: {
  store: ObjectStore;
  prefix: string;
  storeRoot: string;
  manifest: HydrateManifest;
  workspaceRel: string;
  generationAware: boolean;
}): Promise<MigrateSync> {
  const { store } = input;
  const unlisted: ObjectStore = {
    list: (p) => store.list(p),
    download: (key, dest, opts) => store.download(key, dest, opts),
    upload: (src, key, opts) => store.upload(src, key, opts),
    delete: (key, opts) => store.delete(key, opts),
  };
  const scope = migrateScope(input.workspaceRel);
  const prefs = (rel: string) => rel.startsWith(PREFERENCES_PREFIX);
  const uploaded: string[] = [];
  const deleted: string[] = [];
  let manifest = input.manifest;
  for (const [include, last] of [
    [(rel: string) => scope(rel) && !prefs(rel), false],
    [(rel: string) => scope(rel) && prefs(rel), true],
  ] as const) {
    const synced = await syncBack(
      unlisted,
      input.prefix,
      input.storeRoot,
      manifest,
      {
        include,
        holdDeletesOnFailure: true,
        generations: input.generationAware,
      },
    );
    const stray = last ? synced.outOfScope : 0;
    if (synced.conflicts.length + synced.skipped.length + stray > 0)
      return {
        durable: false,
        conflicts: synced.conflicts.map((c) => c.key),
        skipped: synced.skipped.map((s) => s.key),
      };
    uploaded.push(...synced.uploaded);
    deleted.push(...synced.deleted);
    manifest = synced.manifest;
  }
  return { durable: true, uploaded, deleted };
}
