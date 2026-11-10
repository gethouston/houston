import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { landStream } from "./land-file";
import type { DirListing, ObjectMetadata } from "./object-manifest";
import type {
  ObjectStore,
  ReadOptions,
  ReadResult,
  WriteOptions,
} from "./object-store";
import { ObjectNotFoundError } from "./object-store-errors";

/** A directory as the object store: keeps the sync contract testable. */
export class LocalDirStore implements ObjectStore {
  private readonly resolvedRoot: string;

  constructor(root: string) {
    this.resolvedRoot = resolve(root);
  }

  private fileFor(key: string): string {
    const abs = resolve(this.resolvedRoot, ...key.split("/"));
    if (abs !== this.resolvedRoot && !abs.startsWith(this.resolvedRoot + sep)) {
      throw new Error(`key escapes the store root: ${key}`);
    }
    return abs;
  }

  async list(prefix: string): Promise<string[]> {
    const base = this.fileFor(prefix);
    if (!existsSync(base)) return [];
    const out: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const abs = join(dir, entry.name);
        if (entry.isDirectory()) await walk(abs);
        else {
          const rel = relative(base, abs).split(sep).join("/");
          out.push(prefix ? posix.join(prefix, rel) : rel);
        }
      }
    };
    await walk(base);
    return out.sort();
  }

  /** Size + mtime + md5 per key, the same shape the HTTP store serves; no
   *  generations (the local store has none), so readers stay unconditional. */
  async manifest(prefix = ""): Promise<ObjectMetadata[]> {
    const out: ObjectMetadata[] = [];
    for (const key of await this.list(prefix)) out.push(await this.stat(key));
    return out;
  }

  /** One level of `prefix`, as pod-store answers `?delimiter=/`. */
  async manifestDir(prefix = ""): Promise<DirListing> {
    const base = this.fileFor(prefix);
    const entries = existsSync(base)
      ? await readdir(base, { withFileTypes: true })
      : [];
    const key = (name: string) => (prefix ? posix.join(prefix, name) : name);
    const objects: ObjectMetadata[] = [];
    const dirs: string[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) dirs.push(key(entry.name));
      else objects.push(await this.stat(key(entry.name)));
    }
    return {
      objects: objects.sort((a, b) => a.key.localeCompare(b.key)),
      dirs: dirs.sort(),
    };
  }

  private async stat(key: string): Promise<ObjectMetadata> {
    const file = this.fileFor(key);
    const info = await stat(file);
    const hash = createHash("md5");
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    return {
      key,
      size: info.size,
      md5: hash.digest("base64"),
      updated: info.mtime.toISOString(),
    };
  }

  async download(
    key: string,
    destFile: string,
    opts?: ReadOptions,
  ): Promise<ReadResult> {
    try {
      const landed = await landStream(
        () => createReadStream(this.fileFor(key)),
        destFile,
        opts?.signal,
      );
      return landed ? {} : { refused: true };
    } catch (error) {
      // Same taxonomy as the HTTP store's 404: a listed file deleted before
      // the read is a vanished object, not an adapter failure.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      throw new ObjectNotFoundError(
        key,
        `object store GET ${key} failed (404): object not found`,
      );
    }
  }

  async upload(
    srcFile: string,
    key: string,
    _opts?: WriteOptions,
  ): Promise<void> {
    // The local development store has no generations; conditional options are
    // intentionally ignored so its existing filesystem behavior stays exact.
    const dest = this.fileFor(key);
    await mkdir(dirname(dest), { recursive: true });
    await pipeline(createReadStream(srcFile), createWriteStream(dest));
  }

  async delete(key: string, _opts?: WriteOptions): Promise<void> {
    const file = this.fileFor(key);
    const existing = await stat(file).catch(() => null);
    if (existing) await rm(file);
  }
}
