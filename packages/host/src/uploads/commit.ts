import { readFile } from "node:fs/promises";
import { ObjectNotFoundError } from "@houston/runtime-client/object-sync";
import type {
  CommittedUploadFile,
  MigrationImportCommit,
} from "@houston/wire-types";
import type { Vfs } from "../vfs";
import type { LocalUploadSessions } from "./local";
import { UploadError, type UploadIdentity } from "./types";

export interface StagedFile {
  read(): Promise<Buffer>;
  write(vfs: Vfs, key: string): Promise<void>;
  remove(): Promise<void>;
}
/** Resolve the entire batch before writing any destination. */
export interface StagedUploads {
  prepare(file: MigrationImportCommit): Promise<StagedFile>;
}
export function stagedUploads(
  local: LocalUploadSessions | undefined,
  vfs: Vfs,
  identity: UploadIdentity,
): StagedUploads {
  return {
    async prepare(file) {
      if (file.stagedGeneration !== undefined) {
        if (!vfs.copyUpload || !vfs.uploadStore)
          throw new StagedUploadUnavailableError();
        const store = vfs.uploadStore;
        const copy = vfs.copyUpload.bind(vfs);
        const generation = file.stagedGeneration;
        const missing = async <T>(operation: () => Promise<T>): Promise<T> => {
          try {
            return await operation();
          } catch (error) {
            if (error instanceof ObjectNotFoundError)
              throw new UploadError("upload_not_found");
            throw error;
          }
        };
        return {
          read: () =>
            missing(() => store.readUpload(file.uploadId, generation)),
          write: (_vfs, key) =>
            missing(() => copy(file.uploadId, key, generation)),
          remove: async () => {},
        };
      }
      if (!local) throw new UploadError("upload_not_found");
      const path = await local.require(file.uploadId, identity);
      return {
        read: () => readFile(path),
        write: async (target, key) =>
          target.writeBytes(key, await readFile(path)),
        remove: () => local.remove(file.uploadId),
      };
    },
  };
}
export class StagedUploadUnavailableError extends Error {
  readonly status = 400;
  constructor() {
    super("stagedGeneration requires a store-backed host");
  }
}
export type UploadFile =
  | { name: string; contentBase64: string; relPath?: string }
  | CommittedUploadFile;

export async function prepareFiles(
  files: readonly UploadFile[],
  uploads?: StagedUploads,
): Promise<StagedFile[]> {
  return Promise.all(
    files.map(async (file) => {
      if ("uploadId" in file) {
        if (!uploads) throw new UploadError("upload_not_found");
        return uploads.prepare(file);
      }
      return {
        read: async () => Buffer.from(file.contentBase64, "base64"),
        write: async (vfs: Vfs, key: string) =>
          vfs.writeBytes(key, Buffer.from(file.contentBase64, "base64")),
        remove: async () => {},
      };
    }),
  );
}
