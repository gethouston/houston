import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, readdir, rename, rm } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { ManifestObjectStore, ObjectMetadata } from "./object-manifest";

export type SharedMirrorFamily = "skills";

export interface SharedMirrorState {
  /** Opaque digest of the selected remote manifest. */
  fingerprint: string;
}

export interface SharedMirrorSnapshot {
  state: SharedMirrorState;
  objects: ObjectMetadata[];
}

export interface SyncSharedMirrorOptions {
  store: ManifestObjectStore;
  mirrorDir: string;
  snapshot?: SharedMirrorSnapshot;
  families?: readonly SharedMirrorFamily[];
}

export interface SharedMirrorResult {
  state: SharedMirrorState;
  downloaded: string[];
  deleted: string[];
}

const DEFAULT_FAMILIES = ["skills"] as const;

const normalized = (path: string) => path.split(sep).join("/");

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
  const hash = createHash("sha256");
  for (const object of objects) {
    hash.update(`${object.key}\0${object.size}\0${object.md5}\0`);
  }
  return { fingerprint: hash.digest("hex") };
}

/** The cheap freshness probe: one manifest GET, scoped to shared families. */
export async function probeSharedMirror(
  store: ManifestObjectStore,
  families: readonly SharedMirrorFamily[] = DEFAULT_FAMILIES,
): Promise<SharedMirrorSnapshot> {
  const objects = selectedObjects(await store.manifest(), families);
  return { state: stateFor(objects), objects };
}

function localPath(root: string, key: string): string {
  const resolvedRoot = resolve(root);
  const file = resolve(resolvedRoot, ...key.split("/"));
  if (!file.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error(`shared object key escapes mirror root: ${key}`);
  }
  return file;
}

async function digestFile(
  file: string,
): Promise<{ hex: string; base64: string }> {
  const hash = createHash("md5");
  for await (const chunk of createReadStream(file))
    hash.update(chunk as Buffer);
  const digest = hash.digest();
  return { hex: digest.toString("hex"), base64: digest.toString("base64") };
}

async function matches(file: string, object: ObjectMetadata): Promise<boolean> {
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.size !== object.size) return false;
    const digest = await digestFile(file);
    return object.md5 === digest.hex || object.md5 === digest.base64;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function downloadAtomic(
  store: ManifestObjectStore,
  object: ObjectMetadata,
  destination: string,
): Promise<void> {
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    await store.download(object.key, temporary);
    if (!(await matches(temporary, object))) {
      throw new Error(
        `shared object ${object.key} failed size/hash verification`,
      );
    }
    const existing = await lstat(destination).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    });
    if (existing && !existing.isFile()) {
      await rm(destination, { force: true, recursive: true });
    }
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function walkFiles(dir: string, root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walkFiles(path, root)));
    else files.push(normalized(relative(root, path)));
  }
  return files;
}

async function localFamilyFiles(
  root: string,
  families: readonly SharedMirrorFamily[],
): Promise<string[]> {
  const files: string[] = [];
  for (const family of families) {
    const dir = join(root, family);
    await mkdir(dir, { recursive: true });
    files.push(...(await walkFiles(dir, root)));
  }
  return files.sort();
}

/**
 * Reconciles selected read-only shared families into a disposable local cache.
 * The remote manifest is authoritative. A caller may reuse an already-fetched
 * snapshot, but reconciliation always verifies the local bytes.
 */
export async function syncSharedMirror(
  options: SyncSharedMirrorOptions,
): Promise<SharedMirrorResult> {
  const families = options.families ?? DEFAULT_FAMILIES;
  const snapshot =
    options.snapshot ?? (await probeSharedMirror(options.store, families));
  const { objects, state } = snapshot;

  await mkdir(options.mirrorDir, { recursive: true });
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
  return { state, downloaded, deleted };
}
