import { Storage } from "@google-cloud/storage";
import {
  landStream,
  type ObjectMetadata,
  ObjectNotFoundError,
  type ObjectStore,
  privateDirOf,
  type ReadResult,
} from "@houston/runtime-client/object-sync";

const LIST_FIELDS = "items(name,size,md5Hash,updated),nextPageToken";

export class GcsStore implements ObjectStore {
  private readonly bucket;

  constructor(bucketName: string, storage: Storage = new Storage()) {
    if (!bucketName) throw new Error("GcsStore requires a bucket name");
    this.bucket = storage.bucket(bucketName);
  }

  async list(prefix: string): Promise<string[]> {
    const files = await this.listFiles(prefix);
    return files.map((f) => f.name).sort();
  }

  async manifest(prefix = ""): Promise<ObjectMetadata[]> {
    const files = await this.listFiles(prefix);
    return files
      .map((file) => {
        const size = Number(file.metadata.size ?? 0);
        return {
          key: file.name,
          size: Number.isFinite(size) && size >= 0 ? size : 0,
          md5: file.metadata.md5Hash ?? "",
          updated: file.metadata.updated ?? "",
        };
      })
      .sort((left, right) => left.key.localeCompare(right.key));
  }

  async download(key: string, destFile: string): Promise<ReadResult> {
    try {
      const file = this.bucket.file(key);
      if (privateDirOf(destFile))
        return (await landStream(() => file.createReadStream(), destFile))
          ? {}
          : { refused: true };
      await file.download({ destination: destFile });
      return {};
    } catch (error) {
      if ((error as { code?: unknown }).code !== 404) throw error;
      throw new ObjectNotFoundError(
        key,
        `object store GET ${key} failed (404): object not found`,
      );
    }
  }

  async upload(srcFile: string, key: string): Promise<void> {
    await this.bucket.upload(srcFile, { destination: key });
  }

  async delete(key: string): Promise<void> {
    await this.bucket.file(key).delete({ ignoreNotFound: true });
  }

  private async listFiles(prefix: string) {
    const [files] = await this.bucket.getFiles({
      prefix: prefix ? `${prefix}/` : "",
      fields: LIST_FIELDS,
    });
    return files;
  }
}
