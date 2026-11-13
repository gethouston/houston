import type { UploadPurpose } from "@houston/wire-types";
import type { HttpScope } from "../http";
import type { UploadBatchOptions, UploadEntry, UploadInput } from "./types";
import { batchProgress, prepareUpload, uploadEntries } from "./upload-entries";
import { UploadRefusalError } from "./upload-errors";
import { saveAttachments, uploadProjectFiles } from "./uploads";

async function commitBatch<T>(
  scope: HttpScope,
  agentId: string,
  inputs: UploadInput[],
  purpose: UploadPurpose,
  commit: (files: UploadEntry[]) => Promise<T>,
  opts?: UploadBatchOptions,
): Promise<T> {
  const prepared = await uploadEntries(scope, agentId, inputs, purpose, opts);
  for (let attempt = 0; ; attempt++) {
    batchProgress(inputs, opts, "saving");
    try {
      const result = await commit(prepared.map((file) => file.entry));
      batchProgress(inputs, opts, "done");
      return result;
    } catch (error) {
      if (
        attempt > 0 ||
        !(error instanceof UploadRefusalError) ||
        (error.code !== "upload_not_found" &&
          error.code !== "upload_incomplete") ||
        !prepared.some((file) => file.kind === "staged")
      )
        throw error;
      for (const [index, file] of prepared.entries()) {
        if (file.kind !== "staged") continue;
        batchProgress([file.file], opts, "reconnecting");
        prepared[index] = await prepareUpload(
          scope,
          agentId,
          file.file,
          purpose,
          {
            ...opts,
            onProgress: (input, progress) =>
              opts?.onProgress?.(input, { ...progress, phase: "reconnecting" }),
          },
          error.code === "upload_incomplete" ? file.session : undefined,
        );
      }
    }
  }
}

export function saveAttachmentBatch(
  scope: HttpScope,
  agentId: string,
  scopeId: string,
  inputs: UploadInput[],
  opts?: UploadBatchOptions,
): Promise<string[]> {
  return commitBatch(
    scope,
    agentId,
    inputs,
    "attachment",
    (files) => saveAttachments(scope, agentId, scopeId, files, opts),
    opts,
  );
}

export function uploadFileBatch(
  scope: HttpScope,
  agentId: string,
  inputs: UploadInput[],
  targetDir?: string | null,
  opts?: UploadBatchOptions,
): Promise<void> {
  return commitBatch(
    scope,
    agentId,
    inputs,
    "files_import",
    (files) => uploadProjectFiles(scope, agentId, files, targetDir, opts),
    opts,
  );
}
