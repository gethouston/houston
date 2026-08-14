import type { Dirent } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, posix, relative, sep } from "node:path";
import { fileSha256 } from "./file-hash";
import {
  DEFAULT_EXCLUDES,
  excluded,
  type HydrateManifest,
  type HydrateManifestEntry,
} from "./hydrate";
import type { ObjectMetadata } from "./object-manifest";
import {
  type ObjectStore,
  ObjectTooLargeError,
  StoreConflictError,
  type WriteOptions,
} from "./object-store";

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
  /** Bytes the next hydration must materialize, excluding local-only paths. */
  totalBytes: number;
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

function initialWriteOptions(
  generationAware: boolean,
  previous: HydrateManifestEntry | undefined,
): WriteOptions | undefined {
  if (!generationAware) return undefined;
  if (previous?.generation !== undefined) {
    return { ifGenerationMatch: previous.generation };
  }
  return previous ? undefined : { ifGenerationMatch: "0" };
}

/** Upload changes and conditionally remove objects owned by the prior hydrate. */
export async function syncBack(
  store: ObjectStore,
  prefix: string,
  dir: string,
  manifest: HydrateManifest,
  opts: { excludes?: string[]; generations?: boolean } = {},
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
    if (previous?.hash === hash) {
      nextManifest.set(rel, previous);
      continue;
    }

    const key = prefix ? posix.join(prefix, rel) : rel;
    try {
      const result = await store.upload(
        abs,
        key,
        initialWriteOptions(generationAware, previous),
      );
      nextManifest.set(rel, { hash, generation: result?.generation });
      uploaded.push(rel);
    } catch (err) {
      if (err instanceof ObjectTooLargeError) {
        nextManifest.set(rel, { hash });
        skipped.push({ key: rel, reason: err.message });
        continue;
      }
      if (!(err instanceof StoreConflictError)) throw err;
      const refreshedManifest = await refresh();
      if (!refreshedManifest) {
        if (previous) nextManifest.set(rel, previous);
        conflicts.push({ key: rel, reason: err.message });
        continue;
      }
      const current = refreshedManifest.get(key);
      const retryGeneration = current ? current.generation : "0";
      if (retryGeneration === undefined) {
        if (previous) nextManifest.set(rel, previous);
        conflicts.push({ key: rel, reason: err.message });
        continue;
      }
      try {
        const result = await store.upload(abs, key, {
          ifGenerationMatch: retryGeneration,
        });
        nextManifest.set(rel, { hash, generation: result?.generation });
        uploaded.push(rel);
      } catch (retryError) {
        if (!(retryError instanceof StoreConflictError)) throw retryError;
        if (previous) {
          nextManifest.set(rel, { ...previous, generation: retryGeneration });
        }
        conflicts.push({ key: rel, reason: retryError.message });
      }
    }
  }

  const deleted: string[] = [];
  for (const [rel, previous] of manifest) {
    if (nextManifest.has(rel)) continue;
    const key = prefix ? posix.join(prefix, rel) : rel;
    const writeOptions =
      generationAware && previous.generation !== undefined
        ? { ifGenerationMatch: previous.generation }
        : undefined;
    try {
      await store.delete(key, writeOptions);
      deleted.push(rel);
    } catch (err) {
      if (!(err instanceof StoreConflictError)) throw err;
      const refreshedManifest = await refresh();
      if (!refreshedManifest) {
        nextManifest.set(rel, previous);
        conflicts.push({ key: rel, reason: err.message });
        continue;
      }
      const current = refreshedManifest.get(key);
      if (!current) {
        deleted.push(rel);
        continue;
      }
      const retryGeneration = current.generation;
      try {
        await store.delete(
          key,
          retryGeneration === undefined
            ? undefined
            : { ifGenerationMatch: retryGeneration },
        );
        deleted.push(rel);
      } catch (retryError) {
        if (!(retryError instanceof StoreConflictError)) throw retryError;
        nextManifest.set(rel, { ...previous, generation: retryGeneration });
        conflicts.push({ key: rel, reason: retryError.message });
      }
    }
  }
  return {
    uploaded,
    deleted,
    skipped,
    conflicts,
    manifest: nextManifest,
    totalBytes,
  };
}
