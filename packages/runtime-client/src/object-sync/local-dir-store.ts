import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  readdir,
  readlink,
  rm,
  symlink,
} from "node:fs/promises";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { landStream } from "./land-file";
import { landLink } from "./land-link";
import { isExecutable } from "./object-attrs";
import type { DirListing, ObjectMetadata } from "./object-manifest";
import type {
  ObjectStore,
  ReadOptions,
  ReadResult,
  WriteOptions,
} from "./object-store";
import { ObjectNotFoundError } from "./object-store-errors";

export class LocalDirStore implements ObjectStore {
  private readonly resolvedRoot: string;
  readonly fileAttrs = true;

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

  async manifest(prefix = ""): Promise<ObjectMetadata[]> {
    const out: ObjectMetadata[] = [];
    for (const key of await this.list(prefix)) out.push(await this.stat(key));
    return out;
  }

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
    const info = await lstat(file);
    const updated = info.mtime.toISOString();
    if (info.isSymbolicLink()) {
      const link = await readlink(file);
      const md5 = createHash("md5").update(link).digest("base64");
      return { key, size: Buffer.byteLength(link), md5, updated, link };
    }
    const hash = createHash("md5");
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    return {
      key,
      size: info.size,
      md5: hash.digest("base64"),
      updated,
      ...(isExecutable(info.mode) ? { executable: true as const } : {}),
    };
  }

  async download(
    key: string,
    destFile: string,
    opts?: ReadOptions,
  ): Promise<ReadResult> {
    try {
      const source = this.fileFor(key);
      if ((await lstat(source)).isSymbolicLink())
        return (await landLink(key, await readlink(source), destFile))
          ? {}
          : { refused: true };
      const landed = await landStream(
        () => createReadStream(this.fileFor(key)),
        destFile,
        opts?.signal,
      );
      return landed ? {} : { refused: true };
    } catch (error) {
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
    const dest = this.fileFor(key);
    await mkdir(dirname(dest), { recursive: true });
    await rm(dest, { force: true });
    const source = await lstat(srcFile);
    if (source.isSymbolicLink()) {
      await symlink(await readlink(srcFile), dest);
      return;
    }
    await pipeline(createReadStream(srcFile), createWriteStream(dest));
    if (isExecutable(source.mode)) await chmod(dest, source.mode & 0o777);
  }

  async delete(key: string, _opts?: WriteOptions): Promise<void> {
    const file = this.fileFor(key);
    const existing = await lstat(file).catch(() => null);
    if (existing) await rm(file);
  }
}
