import { createHash } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import type { ManifestObjectStore, ObjectMetadata } from "./object-manifest";
import {
  canonicalMetadata,
  downloadAtomic,
  localFamilyFiles,
  localMetadata,
  localPath,
  matches,
  type SharedMirrorFileState,
  sameMetadata,
} from "./shared-mirror-files";

export type SharedMirrorFamily = "skills";

export interface SharedMirrorState {
  /** Opaque digest of the last per-file synchronization baseline. */
  fingerprint: string;
  /** Bytes known to match locally and remotely after the last completed pass. */
  files: Record<string, SharedMirrorFileState>;
}

export interface SharedMirrorSnapshot {
  state: SharedMirrorState;
  objects: ObjectMetadata[];
}

export interface SyncSharedMirrorOptions {
  store: ManifestObjectStore;
  mirrorDir: string;
  snapshot?: SharedMirrorSnapshot;
  state?: SharedMirrorState;
  families?: readonly SharedMirrorFamily[];
  mode?: "push-pull" | "push-only";
  onConflict?: (key: string) => void;
}

export interface SharedMirrorResult {
  state: SharedMirrorState;
  uploaded: string[];
  downloaded: string[];
  deleted: string[];
}

const DEFAULT_FAMILIES = ["skills"] as const;

function selectedObjects(
  manifest: readonly ObjectMetadata[],
  families: readonly SharedMirrorFamily[],
): ObjectMetadata[] {
  const selected = manifest
    .filter((object) =>
      families.some((family) => object.key.startsWith(`${family}/`)),
    )
    .sort((a, b) => a.key.localeCompare(b.key));
  const keys = new Set<string>();
  for (const object of selected) {
    if (keys.has(object.key)) {
      throw new Error(`shared manifest contains duplicate key: ${object.key}`);
    }
    keys.add(object.key);
  }
  return selected;
}

function stateFor(objects: readonly ObjectMetadata[]): SharedMirrorState {
  const files: Record<string, SharedMirrorFileState> = {};
  for (const object of objects) {
    files[object.key] = canonicalMetadata(object);
  }
  return stateFromFiles(files);
}

function stateFromFiles(
  files: Record<string, SharedMirrorFileState>,
): SharedMirrorState {
  const hash = createHash("sha256");
  for (const key of Object.keys(files).sort()) {
    const metadata = files[key];
    hash.update(`${key}\0${metadata?.size}\0${metadata?.md5}\0`);
  }
  return { fingerprint: hash.digest("hex"), files };
}

/** The cheap freshness probe: one manifest GET, scoped to shared families. */
export async function probeSharedMirror(
  store: ManifestObjectStore,
  families: readonly SharedMirrorFamily[] = DEFAULT_FAMILIES,
): Promise<SharedMirrorSnapshot> {
  const objects = selectedObjects(await store.manifest(), families);
  return { state: stateFor(objects), objects };
}

/**
 * Pushes intentional local edits before pulling the shared store. The previous
 * completed state distinguishes edits from stale cache bytes. Local deletion is
 * never uploaded; the pull phase restores any remotely-present file.
 */
export async function syncSharedMirror(
  options: SyncSharedMirrorOptions,
): Promise<SharedMirrorResult> {
  const families = options.families ?? DEFAULT_FAMILIES;
  const snapshot =
    options.snapshot ?? (await probeSharedMirror(options.store, families));
  await mkdir(options.mirrorDir, { recursive: true });
  const remote = new Map(
    snapshot.objects.map((object) => [object.key, object]),
  );
  const uploaded: string[] = [];
  const uploadedMetadata: Record<string, SharedMirrorFileState> = {};
  if (options.state) {
    for (const key of await localFamilyFiles(options.mirrorDir, families)) {
      const metadata = await localMetadata(localPath(options.mirrorDir, key));
      if (!metadata || sameMetadata(metadata, options.state.files[key]))
        continue;
      const remoteMetadata = remote.get(key);
      const canonicalRemote = remoteMetadata
        ? canonicalMetadata(remoteMetadata)
        : undefined;
      // A partial earlier pass may have changed bytes without advancing state.
      // Equal remote bytes prove this is an echo, not a new intentional edit.
      if (sameMetadata(metadata, canonicalRemote)) continue;
      if (!sameMetadata(canonicalRemote, options.state.files[key])) {
        options.onConflict?.(key);
      }
      await options.store.upload(localPath(options.mirrorDir, key), key);
      remote.set(key, {
        key,
        ...metadata,
        updated: remoteMetadata?.updated ?? "",
      });
      uploadedMetadata[key] = metadata;
      uploaded.push(key);
    }
  }

  if (options.mode === "push-only") {
    return {
      state: stateFromFiles({
        ...(options.state?.files ?? {}),
        ...uploadedMetadata,
      }),
      uploaded,
      downloaded: [],
      deleted: [],
    };
  }

  const objects = [...remote.values()].sort((a, b) =>
    a.key.localeCompare(b.key),
  );
  const downloaded: string[] = [];
  for (const object of objects) {
    const destination = localPath(options.mirrorDir, object.key);
    if (await matches(destination, object)) continue;
    await downloadAtomic(options.store, object, destination);
    downloaded.push(object.key);
  }

  const remoteKeys = new Set(objects.map((object) => object.key));
  const deleted: string[] = [];
  for (const key of await localFamilyFiles(options.mirrorDir, families)) {
    if (remoteKeys.has(key)) continue;
    await rm(localPath(options.mirrorDir, key), { force: true });
    deleted.push(key);
  }
  return { state: stateFor(objects), uploaded, downloaded, deleted };
}
