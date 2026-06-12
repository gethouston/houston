import { Storage } from "@google-cloud/storage";

/** One object's listing metadata (for the Files browser). */
export interface ObjectStat {
  key: string;
  size: number;
  updatedMs: number;
}

/**
 * Minimal object-storage port for the control plane's reads/writes of cloudrun
 * workspaces (conversation listings, settings.json, the Files browser, agent
 * deletion). The runtime owns the heavy hydrate/sync path; this is the boring
 * data plane.
 */
export interface ObjectFiles {
  /** All keys under `prefix/` (sorted). */
  list(prefix: string): Promise<string[]>;
  /** Keys under `prefix/` with size + mtime (sorted by key) — drives the Files browser. */
  listDetailed(prefix: string): Promise<ObjectStat[]>;
  /** File contents as UTF-8, or null when the key does not exist. */
  readText(key: string): Promise<string | null>;
  /** Raw bytes, or null when the key does not exist (binary downloads). */
  readBytes(key: string): Promise<Buffer | null>;
  writeText(key: string, content: string): Promise<void>;
  /** Raw-bytes write (binary uploads/seeds). Content type inferred by consumers. */
  writeBytes(key: string, content: Buffer): Promise<void>;
  /** Delete a single key. No-op when absent. */
  deleteKey(key: string): Promise<void>;
  /** Copy then delete (rename). Throws if the source is missing. */
  move(fromKey: string, toKey: string): Promise<void>;
  /** Delete every key under `prefix/` (agent deletion). */
  deletePrefix(prefix: string): Promise<void>;
}

/** In-memory implementation for tests and CP_DEV=1. */
export class MemoryObjectFiles implements ObjectFiles {
  private files = new Map<string, { content: Buffer; updatedMs: number }>();
  private clock = 1;

  async list(prefix: string): Promise<string[]> {
    return [...this.files.keys()].filter((k) => k.startsWith(`${prefix}/`)).sort();
  }

  async listDetailed(prefix: string): Promise<ObjectStat[]> {
    return [...this.files.entries()]
      .filter(([k]) => k.startsWith(`${prefix}/`))
      .map(([key, v]) => ({ key, size: v.content.byteLength, updatedMs: v.updatedMs }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  async readText(key: string): Promise<string | null> {
    return this.files.get(key)?.content.toString("utf8") ?? null;
  }

  async readBytes(key: string): Promise<Buffer | null> {
    return this.files.get(key)?.content ?? null;
  }

  async writeText(key: string, content: string): Promise<void> {
    this.files.set(key, { content: Buffer.from(content, "utf8"), updatedMs: this.clock++ });
  }

  async writeBytes(key: string, content: Buffer): Promise<void> {
    this.files.set(key, { content, updatedMs: this.clock++ });
  }

  async deleteKey(key: string): Promise<void> {
    this.files.delete(key);
  }

  async move(fromKey: string, toKey: string): Promise<void> {
    const v = this.files.get(fromKey);
    if (!v) throw new Error(`move: source not found: ${fromKey}`);
    this.files.set(toKey, { content: v.content, updatedMs: this.clock++ });
    this.files.delete(fromKey);
  }

  async deletePrefix(prefix: string): Promise<void> {
    for (const k of [...this.files.keys()]) {
      if (k.startsWith(`${prefix}/`)) this.files.delete(k);
    }
  }
}

/** GCS implementation (ADC auth; the CP's SA holds objectAdmin on this bucket only). */
export class GcsObjectFiles implements ObjectFiles {
  private readonly bucket;

  constructor(bucketName: string, storage: Storage = new Storage()) {
    if (!bucketName) throw new Error("GcsObjectFiles requires a bucket name (CP_GCS_BUCKET)");
    this.bucket = storage.bucket(bucketName);
  }

  async list(prefix: string): Promise<string[]> {
    const [files] = await this.bucket.getFiles({ prefix: `${prefix}/` });
    return files.map((f) => f.name).sort();
  }

  async listDetailed(prefix: string): Promise<ObjectStat[]> {
    const [files] = await this.bucket.getFiles({ prefix: `${prefix}/` });
    return files
      .map((f) => ({
        key: f.name,
        size: Number(f.metadata.size ?? 0),
        updatedMs: f.metadata.updated ? Date.parse(f.metadata.updated) : 0,
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  async readText(key: string): Promise<string | null> {
    const buf = await this.readBytes(key);
    return buf ? buf.toString("utf8") : null;
  }

  async readBytes(key: string): Promise<Buffer | null> {
    try {
      const [buf] = await this.bucket.file(key).download();
      return buf;
    } catch (err) {
      if ((err as { code?: number }).code === 404) return null;
      throw err;
    }
  }

  async writeText(key: string, content: string): Promise<void> {
    await this.bucket.file(key).save(content, { contentType: "application/json" });
  }

  async writeBytes(key: string, content: Buffer): Promise<void> {
    await this.bucket.file(key).save(content, { contentType: "application/octet-stream" });
  }

  async deleteKey(key: string): Promise<void> {
    await this.bucket.file(key).delete({ ignoreNotFound: true });
  }

  async move(fromKey: string, toKey: string): Promise<void> {
    await this.bucket.file(fromKey).move(toKey);
  }

  async deletePrefix(prefix: string): Promise<void> {
    await this.bucket.deleteFiles({ prefix: `${prefix}/` });
  }
}
