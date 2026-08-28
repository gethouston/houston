import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import type { ObjectMetadata } from "./object-manifest";

/**
 * The object-storage port behind durable engine state. Keys are forward-slash
 * relative paths. Production adapters can live with their owning deployment;
 * LocalDirStore keeps the synchronization contract testable against real files.
 */
export interface ObjectStore {
  /** All keys under a prefix (prefix itself excluded; no delimiter semantics). */
  list(prefix: string): Promise<string[]>;
  manifest?(
    prefix?: string,
  ): Promise<import("./object-manifest").ObjectMetadata[]>;
  download(key: string, destFile: string, opts?: ReadOptions): Promise<void>;
  /** Download one object and return metadata from the same read response. */
  downloadVersioned?(
    key: string,
    destFile: string,
    opts?: ReadOptions,
  ): Promise<ReadResult>;
  upload(
    srcFile: string,
    key: string,
    opts?: WriteOptions,
    // biome-ignore lint/suspicious/noConfusingVoidType: additive port widening must accept existing void-returning stores.
  ): Promise<WriteResult | void>;
  delete(key: string, opts?: WriteOptions): Promise<void>;
}

export interface ReadOptions {
  signal?: AbortSignal;
}

export interface WriteOptions {
  /** `0` means create-only. */
  ifGenerationMatch?: string;
}

/** Metadata captured atomically with an object download. */
export interface ReadResult {
  generation?: string;
}

export interface WriteResult {
  generation?: string;
}

/**
 * The store's deterministic verdict that ONE object exceeds its per-object cap
 * (the gateway's 413 over GW_BLOB_MAX_OBJECT_MB). Unlike a transient failure,
 * re-uploading the same bytes can never succeed — syncBack skips the object
 * and keeps the pass alive instead of letting one oversized file block every
 * other file's persistence (HOUSTON-APP-4Y7). Adapters raise it from upload.
 */
export class ObjectTooLargeError extends Error {
  constructor(
    readonly key: string,
    message: string,
  ) {
    super(message);
    this.name = "ObjectTooLargeError";
  }
}

/**
 * The object vanished between a listing and this request: another writer
 * deleted it. Readers treat it as an absent key, never a failure — a stale
 * manifest entry must not fail a whole turn (HOUSTON-APP-5AS).
 */
export class ObjectNotFoundError extends Error {
  constructor(
    readonly key: string,
    message: string,
  ) {
    super(message);
    this.name = "ObjectNotFoundError";
  }
}

/** The gateway rejected a stale pod after another boot acquired the lease. */
export class StoreFencedError extends Error {
  constructor(
    readonly key: string,
    message: string,
  ) {
    super(message);
    this.name = "StoreFencedError";
  }
}

/** A generation precondition missed because the remote object changed. */
export class StoreConflictError extends Error {
  constructor(
    readonly key: string,
    message: string,
  ) {
    super(message);
    this.name = "StoreConflictError";
  }
}

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
    for (const key of await this.list(prefix)) {
      const file = this.fileFor(key);
      const info = await stat(file);
      const hash = createHash("md5");
      for await (const chunk of createReadStream(file)) hash.update(chunk);
      out.push({
        key,
        size: info.size,
        md5: hash.digest("base64"),
        updated: info.mtime.toISOString(),
      });
    }
    return out;
  }

  async download(
    key: string,
    destFile: string,
    opts?: ReadOptions,
  ): Promise<void> {
    await mkdir(dirname(destFile), { recursive: true });
    try {
      await pipeline(
        createReadStream(this.fileFor(key)),
        createWriteStream(destFile),
        ...(opts?.signal ? [{ signal: opts.signal }] : []),
      );
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
