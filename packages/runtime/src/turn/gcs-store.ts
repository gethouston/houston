import { Storage } from "@google-cloud/storage";
import type { ObjectStore } from "./object-store";

/**
 * GCS-backed ObjectStore. Auth is Application Default Credentials (the Cloud
 * Run service account); the runtime SA holds objectAdmin on THIS bucket only.
 * Thin by design — all hydration/diff logic lives in hydrate.ts and is tested
 * against LocalDirStore; this adapter is exercised by the deploy smoke test.
 */
export class GcsStore implements ObjectStore {
  private readonly bucket;

  constructor(bucketName: string, storage: Storage = new Storage()) {
    if (!bucketName) throw new Error("GcsStore requires a bucket name");
    this.bucket = storage.bucket(bucketName);
  }

  async list(prefix: string): Promise<string[]> {
    const [files] = await this.bucket.getFiles({ prefix: `${prefix}/` });
    return files.map((f) => f.name).sort();
  }

  async download(key: string, destFile: string): Promise<void> {
    await this.bucket.file(key).download({ destination: destFile });
  }

  async upload(srcFile: string, key: string): Promise<void> {
    await this.bucket.upload(srcFile, { destination: key });
  }

  async delete(key: string): Promise<void> {
    await this.bucket.file(key).delete({ ignoreNotFound: true });
  }
}
