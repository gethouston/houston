import { throwIfAborted } from "../abortable-wait";
import { upload } from "../files/resumable-upload";
import { uploadFallbackAllowed, uploadRefusal } from "../files/upload-errors";
import type { HttpScope } from "../http";
import { migrationImport } from "./http";
import type { MigrationImportOptions, MigrationImportResult } from "./types";

export async function importArchive(
  scope: HttpScope,
  agentId: string,
  bytes: ArrayBuffer,
  opts?: MigrationImportOptions,
): Promise<MigrationImportResult> {
  throwIfAborted(opts?.signal);
  let body: ArrayBuffer | { uploadId: string } = bytes;
  try {
    body = await upload(scope, agentId, new Blob([bytes]), {
      name: "migration.zip",
      purpose: "migration_import",
      ...opts,
    });
  } catch (error) {
    if (!uploadFallbackAllowed(error)) throw error;
    opts?.onProgress?.({
      sentBytes: 0,
      totalBytes: bytes.byteLength,
      phase: "uploading",
    });
  }
  throwIfAborted(opts?.signal);
  opts?.onProgress?.({
    sentBytes: bytes.byteLength,
    totalBytes: bytes.byteLength,
    phase: "saving",
  });
  try {
    const result = await migrationImport(scope, agentId, body, opts);
    throwIfAborted(opts?.signal);
    opts?.onProgress?.({
      sentBytes: bytes.byteLength,
      totalBytes: bytes.byteLength,
      phase: "done",
    });
    return result;
  } catch (error) {
    throw uploadRefusal(error);
  }
}
