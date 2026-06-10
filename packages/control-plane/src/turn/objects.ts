import { Storage } from "@google-cloud/storage";

/**
 * Minimal object-storage port for the control plane's reads/writes of cloudrun
 * workspaces (conversation listings, settings.json, agent deletion). The
 * runtime owns the heavy hydrate/sync path; this is the boring data plane.
 */
export interface ObjectFiles {
  /** All keys under `prefix/` (sorted). */
  list(prefix: string): Promise<string[]>;
  /** File contents as UTF-8, or null when the key does not exist. */
  readText(key: string): Promise<string | null>;
  writeText(key: string, content: string): Promise<void>;
  /** Delete every key under `prefix/` (agent deletion). */
  deletePrefix(prefix: string): Promise<void>;
}

/** In-memory implementation for tests and CP_DEV=1. */
export class MemoryObjectFiles implements ObjectFiles {
  private files = new Map<string, string>();

  async list(prefix: string): Promise<string[]> {
    return [...this.files.keys()].filter((k) => k.startsWith(`${prefix}/`)).sort();
  }

  async readText(key: string): Promise<string | null> {
    return this.files.get(key) ?? null;
  }

  async writeText(key: string, content: string): Promise<void> {
    this.files.set(key, content);
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

  async readText(key: string): Promise<string | null> {
    try {
      const [buf] = await this.bucket.file(key).download();
      return buf.toString("utf8");
    } catch (err) {
      if ((err as { code?: number }).code === 404) return null;
      throw err;
    }
  }

  async writeText(key: string, content: string): Promise<void> {
    await this.bucket.file(key).save(content, { contentType: "application/json" });
  }

  async deletePrefix(prefix: string): Promise<void> {
    await this.bucket.deleteFiles({ prefix: `${prefix}/` });
  }
}
