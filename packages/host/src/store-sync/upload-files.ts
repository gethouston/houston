import { randomUUID } from "node:crypto";
import { rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { atomicTempPath } from "@houston/protocol";
import {
  type CopiedUpload,
  fileSha256,
  type HydrateManifest,
  isUploadStore,
  UploadCopyExistsError,
  type UploadStore,
} from "@houston/runtime-client/object-sync";
import { assertSafeKey } from "../vfs/vfs";
import { runHydrate } from "./daemon-hydrate";
import { runSyncBack, type StoreSyncOptions } from "./daemon-policy";

/** The baseline and its copied files change in the same queue as sync-back. */
export class SyncedUploadFiles {
  manifest: HydrateManifest = new Map();
  private pending: Promise<unknown> = Promise.resolve();
  readonly uploadStore: UploadStore | undefined;
  constructor(private readonly opts: StoreSyncOptions) {
    this.uploadStore = isUploadStore(opts.store) ? opts.store : undefined;
  }
  hydrate(excludes: string[]): Promise<number> {
    return this.serial(async () => {
      this.manifest = await runHydrate(this.opts, excludes);
      return this.manifest.size;
    });
  }
  sync(excludes: string[]) {
    return this.serial(async () => {
      const result = await runSyncBack(this.opts, this.manifest, excludes);
      this.manifest = result.manifest;
      return result;
    });
  }
  copyUpload(uploadId: string, key: string, generation: string): Promise<void> {
    return this.serial(async () => {
      assertSafeKey(key);
      if (!this.uploadStore) throw new Error("upload store not configured");
      const destination = join(this.opts.rootDir, ...key.split("/"));
      let copied: CopiedUpload;
      try {
        copied = await this.uploadStore.copyUpload(uploadId, key, generation);
      } catch (error) {
        if (!(error instanceof UploadCopyExistsError)) throw error;
        const localExists = await stat(destination).then(
          () => true,
          (error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") return false;
            throw error;
          },
        );
        if (localExists) throw error;
        // A local deletion may still be waiting for the next sync-back pass.
        await this.opts.store.delete(key);
        copied = await this.uploadStore.copyUpload(uploadId, key, generation);
      }
      const temp = atomicTempPath(destination, randomUUID());
      try {
        const read = await this.opts.store.download(key, temp);
        if (read?.refused)
          throw new Error("copied upload could not be materialized");
        const { size } = await stat(temp);
        if (size !== copied.size)
          throw new Error("copied upload size differs from its metadata");
        const hash = await fileSha256(temp, size);
        // Hash before publishing, so an agent's subsequent edit stays a local change.
        await rename(temp, destination);
        this.manifest.set(key, { hash, generation: copied.generation });
      } catch (error) {
        try {
          await this.opts.store.delete(key, {
            ifGenerationMatch: copied.generation,
          });
        } catch (cleanupError) {
          throw new Error(
            "Copied upload could not be materialized or removed",
            {
              cause: cleanupError,
            },
          );
        } finally {
          await rm(temp, { force: true });
        }
        throw error;
      }
    });
  }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.pending.then(operation);
    this.pending = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
