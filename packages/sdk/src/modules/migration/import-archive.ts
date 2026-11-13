import type { UploadSession } from "@houston/wire-types";
import { throwIfAborted } from "../abortable-wait";
import { transferUpload } from "../files/resumable-upload";
import {
  UploadRefusalError,
  uploadFallbackAllowed,
  uploadRefusal,
} from "../files/upload-errors";
import type { HttpScope } from "../http";
import { migrationImport } from "./http";
import type { MigrationImportOptions, MigrationImportResult } from "./types";

export async function importArchive(
  scope: HttpScope,
  agentId: string,
  bytes: ArrayBuffer,
  opts?: MigrationImportOptions,
): Promise<MigrationImportResult> {
  const blob = new Blob([bytes]);
  let session: UploadSession | undefined;
  let resume: UploadSession | undefined;
  for (let attempt = 0; ; attempt++) {
    throwIfAborted(opts?.signal);
    try {
      session = await transferUpload(
        scope,
        agentId,
        blob,
        {
          name: "migration.zip",
          purpose: "migration_import",
          ...opts,
          onProgress: (progress) =>
            opts?.onProgress?.({
              ...progress,
              phase: attempt > 0 ? "reconnecting" : progress.phase,
            }),
        },
        resume,
      );
    } catch (error) {
      if (!uploadFallbackAllowed(error)) throw error;
      session = undefined;
      opts?.onProgress?.({
        sentBytes: 0,
        totalBytes: bytes.byteLength,
        phase: attempt > 0 ? "reconnecting" : "uploading",
      });
    }
    throwIfAborted(opts?.signal);
    opts?.onProgress?.({
      sentBytes: bytes.byteLength,
      totalBytes: bytes.byteLength,
      phase: "saving",
    });
    try {
      const result = await migrationImport(
        scope,
        agentId,
        session ? { uploadId: session.uploadId } : bytes,
        opts,
      );
      throwIfAborted(opts?.signal);
      opts?.onProgress?.({
        sentBytes: bytes.byteLength,
        totalBytes: bytes.byteLength,
        phase: "done",
      });
      return result;
    } catch (error) {
      const refusal = uploadRefusal(error);
      if (
        attempt > 0 ||
        !session ||
        !(refusal instanceof UploadRefusalError) ||
        (refusal.code !== "upload_not_found" &&
          refusal.code !== "upload_incomplete")
      )
        throw refusal;
      opts?.onProgress?.({
        sentBytes: bytes.byteLength,
        totalBytes: bytes.byteLength,
        phase: "reconnecting",
      });
      resume = refusal.code === "upload_incomplete" ? session : undefined;
    }
  }
}
