/**
 * Intake for Files-tab uploads (file picker, folder picker, drag-drop),
 * mirroring the chat composer's folder intake (HOU-808) for the Files tab
 * (HOU-889): hidden files a folder pick sweeps in (.DS_Store, .git/**) are
 * dropped, batches with too many files are refused loudly — uploading a silent
 * subset would misrepresent what got uploaded — and dropped-folder expansion
 * failures surface as toasts (the async walk has no caller to throw to).
 *
 * A file over the host's size cap is different: it is a per-file problem, so
 * the batch is NOT refused. The valid files upload and a toast names the ones
 * left behind (HOU-970) — refusing the whole drop would punish the user for
 * one stray video in a folder of documents.
 */
import {
  MAX_ATTACHMENT_FILES,
  TooManyAttachmentFilesError,
  visibleAttachmentFiles,
} from "@houston-ai/core";
import type { TFunction } from "i18next";
import { formatBytes } from "../../lib/attachment-validation";
import { showErrorToast, showExpectedStateToast } from "../../lib/error-toast";
import {
  MAX_UPLOAD_FILE_BYTES,
  splitOversizedUploads,
} from "../../lib/files-upload-limits";

export function buildUploadIntake(
  t: TFunction<"agents">,
  upload: (files: File[], targetDir?: string | null) => void,
) {
  const tooManyFiles = () =>
    showExpectedStateToast(
      t("files.uploadFiles"),
      t("chat:composer.tooManyFiles", { max: MAX_ATTACHMENT_FILES }),
    );
  const tooLarge = (oversized: File[]) =>
    showExpectedStateToast(
      t("files.uploadTooLarge.title", { count: oversized.length }),
      t("files.uploadTooLarge.description", {
        count: oversized.length,
        names: oversized.map((file) => file.name).join(", "),
        maxSize: formatBytes(MAX_UPLOAD_FILE_BYTES),
      }),
    );
  const ingest = (picked: File[], targetDir?: string | null) => {
    const visible = visibleAttachmentFiles(picked);
    if (visible.length > MAX_ATTACHMENT_FILES) {
      tooManyFiles();
      return;
    }
    const { accepted, oversized } = splitOversizedUploads(visible);
    if (oversized.length > 0) tooLarge(oversized);
    if (accepted.length > 0) upload(accepted, targetDir);
  };
  const onDropError = (error: unknown) => {
    if (error instanceof TooManyAttachmentFilesError) {
      tooManyFiles();
      return;
    }
    showErrorToast(
      "files_drop",
      error instanceof Error ? error.message : String(error),
      error,
      { userMessage: t("files.folderDropFailed") },
    );
  };
  return { ingest, onDropError };
}
