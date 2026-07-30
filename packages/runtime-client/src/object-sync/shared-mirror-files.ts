import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, readdir, rename, rm } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { ManifestObjectStore, ObjectMetadata } from "./object-manifest";

export interface SharedMirrorFileState {
  size: number;
  md5: string;
}

const normalized = (path: string) => path.split(sep).join("/");

export function canonicalMetadata(
  object: Pick<ObjectMetadata, "size" | "md5">,
): SharedMirrorFileState {
  const md5 = /^[a-f\d]{32}$/i.test(object.md5)
    ? Buffer.from(object.md5, "hex").toString("base64")
    : object.md5;
  return { size: object.size, md5 };
}

export function sameMetadata(
  left: SharedMirrorFileState | undefined,
  right: SharedMirrorFileState | undefined,
): boolean {
  return left?.size === right?.size && left?.md5 === right?.md5;
}

export function localPath(root: string, key: string): string {
  const resolvedRoot = resolve(root);
  const file = resolve(resolvedRoot, ...key.split("/"));
  if (!file.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error(`shared object key escapes mirror root: ${key}`);
  }
  return file;
}

export async function localMetadata(
  file: string,
): Promise<SharedMirrorFileState | undefined> {
  try {
    const info = await lstat(file);
    if (!info.isFile()) return undefined;
    const hash = createHash("md5");
    for await (const chunk of createReadStream(file)) {
      hash.update(chunk as Buffer);
    }
    return { size: info.size, md5: hash.digest("base64") };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function matches(
  file: string,
  object: Pick<ObjectMetadata, "size" | "md5">,
): Promise<boolean> {
  return sameMetadata(await localMetadata(file), canonicalMetadata(object));
}

export async function downloadAtomic(
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
    else if (entry.isFile()) files.push(normalized(relative(root, path)));
  }
  return files;
}

export async function localFamilyFiles(
  root: string,
  families: readonly string[],
): Promise<string[]> {
  const files: string[] = [];
  for (const family of families) {
    const dir = join(root, family);
    await mkdir(dir, { recursive: true });
    files.push(...(await walkFiles(dir, root)));
  }
  return files.sort();
}
