import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, posix, relative, sep } from "node:path";
import { fileSha256 } from "./file-hash";
import { DEFAULT_EXCLUDES, excluded, type HydrateManifest } from "./hydrate";
import type { ObjectMetadata } from "./object-manifest";
import type { ObjectStore } from "./object-store";
import { deleteOwnedObject, uploadChangedObject } from "./sync-back-conflicts";

export interface SyncResult {
  uploaded: string[];
  deleted: string[];
  manifest: HydrateManifest;
  /**
   * Files the store REJECTED as over its per-object cap (typed 413). They stay
   * local-only: recorded in the manifest at their current hash so the pass
   * completes and the upload is re-attempted only when the file changes —
   * never as an every-tick retry of a deterministic verdict.
   */
  skipped: { key: string; reason: string }[];
  /**
   * Per-object generation conflicts (typed 412) that survived one refreshed
   * retry. The pass continues past them; a FENCE rejection (409) aborts it
   * instead — that pod is no longer the writer, and every further write would
   * be garbage.
   */
  conflicts: { key: string; reason: string }[];
  /** Changed paths rejected by the caller's write scope. */
  outOfScope: number;
  /** Bytes the next hydration must materialize, excluding local-only paths. */
  totalBytes: number;
}

/** Caller policy for exclusions, generations, and permitted write paths. */
export interface SyncBackOptions {
  excludes?: string[];
  generations?: boolean;
  /** Limit writes and deletes while still detecting skipped changes. */
  include?: (relativePath: string) => boolean;
  /**
   * Skip the delete pass entirely when any upload was skipped or conflicted.
   * A rename/move uploads the new key and deletes the old one; if the upload
   * is refused (over the store's cap, a conflict) the delete would destroy
   * the ONLY durable copy. One-shot callers (a pool op) set this; the
   * standing daemon retries on its next tick and keeps the default.
   */
  holdDeletesOnFailure?: boolean;
}

async function walkFiles(dir: string, base: string): Promise<string[]> {
  const out: string[] = [];
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw err;
  }
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) out.push(...(await walkFiles(abs, base)));
    else out.push(relative(base, abs).split(sep).join("/"));
  }
  return out;
}

/** Upload changes and conditionally remove objects owned by the prior hydrate. */
export async function syncBack(
  store: ObjectStore,
  prefix: string,
  dir: string,
  manifest: HydrateManifest,
  opts: SyncBackOptions = {},
): Promise<SyncResult> {
  const excludes = opts.excludes ?? DEFAULT_EXCLUDES;
  // opts.generations is the gateway's explicit capability signal (the boot
  // lease response advertises whether the blob backend supports generation
  // preconditions). It matters exactly where inference cannot work: an empty
  // manifest has no generations to observe, so without the signal a cold
  // agent must write unconditionally and concurrent first creates are
  // last-writer-wins — while sending create-only "0" blindly would 501 on
  // generation-less HTTP backends. Old gateways omit the field; fall back to
  // inferring capability from observed generations.
  const generationAware =
    opts.generations ??
    [...manifest.values()].some(({ generation }) => generation !== undefined);
  const uploaded: string[] = [];
  const skipped: SyncResult["skipped"] = [];
  const conflicts: SyncResult["conflicts"] = [];
  const nextManifest: HydrateManifest = new Map();
  let outOfScope = 0;
  let refreshed: Promise<Map<string, ObjectMetadata>> | undefined;
  const refresh = () => {
    if (!store.manifest) return undefined;
    refreshed ??= store
      .manifest(prefix)
      .then(
        (objects) => new Map(objects.map((object) => [object.key, object])),
      );
    return refreshed;
  };
  let totalBytes = 0;

  for (const rel of await walkFiles(dir, dir)) {
    if (excluded(rel, excludes)) continue;
    const abs = join(dir, ...rel.split("/"));
    // The agent keeps writing during a sync pass, so a walked file may vanish
    // before it is read (runtime session files are rewritten constantly). A
    // vanished file is indistinguishable from one deleted before the walk:
    // leave it out of the next manifest and let the delete pass reconcile the
    // store, instead of aborting the whole pass mid-upload.
    let hash: string;
    let size: number;
    try {
      const fileStat = await stat(abs);
      if (!fileStat.isFile()) continue;
      size = fileStat.size;
      hash = await fileSha256(abs, size);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
    totalBytes += size;
    const previous = manifest.get(rel);
    if (opts.include && !opts.include(rel)) {
      // Out of the caller's write scope: never uploaded, but still counted
      // toward the next hydration and kept in the manifest as it was.
      if (previous?.hash !== hash) outOfScope += 1;
      if (previous) nextManifest.set(rel, previous);
      continue;
    }
    if (previous?.hash === hash) {
      nextManifest.set(rel, previous);
      continue;
    }

    const key = prefix ? posix.join(prefix, rel) : rel;
    const result = await uploadChangedObject({
      store,
      abs,
      key,
      hash,
      previous,
      generationAware,
      refresh,
    });
    if (result.entry) nextManifest.set(rel, result.entry);
    if (result.uploaded) uploaded.push(rel);
    if (result.skipped) skipped.push({ key: rel, reason: result.skipped });
    if (result.conflict) conflicts.push({ key: rel, reason: result.conflict });
  }

  const deleted: string[] = [];
  const holdDeletes =
    opts.holdDeletesOnFailure === true &&
    (skipped.length > 0 || conflicts.length > 0);
  for (const [rel, previous] of manifest) {
    if (nextManifest.has(rel)) continue;
    if (holdDeletes) {
      // Keep the prior entry so the object stays owned and durable.
      nextManifest.set(rel, previous);
      continue;
    }
    if (opts.include && !opts.include(rel)) {
      nextManifest.set(rel, previous);
      outOfScope += 1;
      continue;
    }
    const key = prefix ? posix.join(prefix, rel) : rel;
    const result = await deleteOwnedObject({
      store,
      key,
      previous,
      generationAware,
      refresh,
    });
    if (result.deleted) deleted.push(rel);
    if (result.entry) nextManifest.set(rel, result.entry);
    if (result.conflict) conflicts.push({ key: rel, reason: result.conflict });
  }
  return {
    uploaded,
    deleted,
    skipped,
    conflicts,
    outOfScope,
    manifest: nextManifest,
    totalBytes,
  };
}
