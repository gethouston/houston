import type { HttpScope } from "../http";
import type { UploadBatchOptions, UploadInput } from "./types";
import { batchProgress, uploadEntries } from "./upload-entries";
import { saveAttachments, uploadProjectFiles } from "./uploads";

export async function saveAttachmentBatch(
  scope: HttpScope,
  agentId: string,
  scopeId: string,
  inputs: UploadInput[],
  opts?: UploadBatchOptions,
): Promise<string[]> {
  const files = await uploadEntries(scope, agentId, inputs, "attachment", opts);
  batchProgress(inputs, opts, "saving");
  const paths = await saveAttachments(scope, agentId, scopeId, files, opts);
  batchProgress(inputs, opts, "done");
  return paths;
}

export async function uploadFileBatch(
  scope: HttpScope,
  agentId: string,
  inputs: UploadInput[],
  targetDir?: string | null,
  opts?: UploadBatchOptions,
): Promise<void> {
  const files = await uploadEntries(
    scope,
    agentId,
    inputs,
    "files_import",
    opts,
  );
  batchProgress(inputs, opts, "saving");
  await uploadProjectFiles(scope, agentId, files, targetDir, opts);
  batchProgress(inputs, opts, "done");
}
