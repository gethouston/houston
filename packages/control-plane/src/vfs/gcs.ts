import { Storage } from "@google-cloud/storage";
import { assertSafeKey, type ObjectStat, type Vfs } from "./vfs";

/** GCS Vfs (ADC auth; the host's SA holds objectAdmin on this bucket only). */
export class GcsVfs implements Vfs {
  private readonly bucket;

  constructor(bucketName: string, storage: Storage = new Storage()) {
    if (!bucketName) throw new Error("GcsVfs requires a bucket name (CP_GCS_BUCKET)");
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
    assertSafeKey(key);
    await this.bucket.file(key).save(content, { contentType: "application/json" });
  }

  async writeBytes(key: string, content: Buffer): Promise<void> {
    assertSafeKey(key);
    await this.bucket.file(key).save(content, { contentType: "application/octet-stream" });
  }

  async deleteKey(key: string): Promise<void> {
    await this.bucket.file(key).delete({ ignoreNotFound: true });
  }

  async move(fromKey: string, toKey: string): Promise<void> {
    assertSafeKey(toKey);
    await this.bucket.file(fromKey).move(toKey);
  }

  async deletePrefix(prefix: string): Promise<void> {
    await this.bucket.deleteFiles({ prefix: `${prefix}/` });
  }
}
