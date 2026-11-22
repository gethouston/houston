import {
  type HydrateManifest,
  type ObjectStore,
  syncBack,
} from "@houston/runtime-client/object-sync";
import { migrateScope, PREFERENCES_PREFIX } from "./op-migrate-tree";

export type MigrateSync =
  | { durable: true; uploaded: string[]; deleted: string[] }
  | { durable: false; conflicts: string[]; skipped: string[] };

/**
 * Write a migrated tree back. Every new file is create-only and every
 * rewrite carries the generation it read, and the store goes in WITHOUT its
 * listing, so a 412 stays a conflict: the sync's refreshed-generation retry
 * would otherwise write over an object a racing writer just landed
 * (op-seed-sync.ts does the same). Two passes: the workspace preferences,
 * where the GROUP.md and sidebar steps keep their done-markers, go only
 * after everything else landed, so a marker never claims a removal the
 * store does not have yet.
 */
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
    // The first pass leaves the preferences changed on purpose; a change
    // outside the scope is still changed in the last pass, and counted there.
    const stray = last ? synced.outOfScope : 0;
    const kept = synced.deletesKept.length;
    if (synced.conflicts.length + synced.skipped.length + stray + kept > 0)
      return {
        durable: false,
        conflicts: [...synced.conflicts, ...synced.deletesKept].map(
          (c) => c.key,
        ),
        skipped: synced.skipped.map((s) => s.key),
      };
    uploaded.push(...synced.uploaded);
    deleted.push(...synced.deleted);
    manifest = synced.manifest;
  }
  return { durable: true, uploaded, deleted };
}
