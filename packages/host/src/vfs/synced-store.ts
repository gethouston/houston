import type { UploadStore } from "@houston/runtime-client/object-sync";
import { FsVfs } from "./fs";

/** Awake pods keep files on disk for the runtime and adopt store-side copies. */
export class SyncedStoreVfs extends FsVfs {
  constructor(
    root: string,
    readonly uploadStore: UploadStore,
    readonly copyUpload: (
      id: string,
      key: string,
      generation: string,
    ) => Promise<void>,
  ) {
    super(root);
  }
}
