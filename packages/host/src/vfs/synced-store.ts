import type { UploadStore } from "@houston/runtime-client/object-sync";
import { FsVfs } from "./fs";

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
