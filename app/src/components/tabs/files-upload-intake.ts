/**
 * Intake for Files-tab uploads (file picker, folder picker, drag-drop),
 * mirroring the chat composer's folder intake (HOU-808) for the Files tab
 * (HOU-889): hidden files a folder pick sweeps in (.DS_Store, .git/**) are
 * dropped, oversized batches are refused loudly — uploading a silent subset
 * would misrepresent what got uploaded — and dropped-folder expansion
 * failures surface as toasts (the async walk has no caller to throw to).
 */
import {
  MAX_ATTACHMENT_FILES,
  TooManyAttachmentFilesError,
  visibleAttachmentFiles,
} from "@houston-ai/core";
import type { TFunction } from "i18next";
import { showErrorToast, showExpectedStateToast } from "../../lib/error-toast";

export function buildUploadIntake(
  t: TFunction<"agents">,
  upload: (files: File[], targetDir?: string | null) => void,
) {
  const tooManyFiles = () =>
    showExpectedStateToast(
      t("files.uploadFiles"),
      t("chat:composer.tooManyFiles", { max: MAX_ATTACHMENT_FILES }),
    );
  const ingest = (picked: File[], targetDir?: string | null) => {
    const visible = visibleAttachmentFiles(picked);
    if (visible.length > MAX_ATTACHMENT_FILES) {
      tooManyFiles();
      return;
    }
    if (visible.length > 0) upload(visible, targetDir);
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
