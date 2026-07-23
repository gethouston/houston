import { useCallback } from "react";
import { MAX_ATTACHMENT_FILES } from "./attachment-folders";
import type {
  AttachmentRejection,
  PrepareAttachments,
} from "./chat-panel-types";
import { mergeUniqueFiles } from "./use-file-drop-zone";

export const DEFAULT_TOO_MANY_FILES_NOTICE = `You can attach up to ${MAX_ATTACHMENT_FILES} files at a time`;

/**
 * The single ingest path for user-attached files. Every entry point (drop,
 * picker, clipboard paste) funnels through here so validation, dedupe and
 * the duplicate-file notice behave identically. Both `ChatInput` and the
 * panel-wide drop zone in `ChatPanel` consume this — keep it the only
 * place that owns that sequence.
 */
export interface AttachmentIntakeOptions {
  files: File[];
  setFiles: (files: File[]) => void;
  prepareAttachments?: PrepareAttachments;
  onAttachmentRejections?: (rejections: AttachmentRejection[]) => void;
  onNotice?: (message: string) => void;
  duplicateNotice?: string;
  tooManyNotice?: string;
}

export function useAttachmentIntake({
  files,
  setFiles,
  prepareAttachments,
  onAttachmentRejections,
  onNotice,
  duplicateNotice,
  tooManyNotice,
}: AttachmentIntakeOptions): (incoming: File[]) => void {
  return useCallback(
    (incoming: File[]) => {
      // A folder pick can sweep in thousands of files (the drop path already
      // aborts its traversal at the same ceiling). Refuse the whole batch —
      // attaching a silent subset would misrepresent what the agent gets.
      if (incoming.length + files.length > MAX_ATTACHMENT_FILES) {
        onNotice?.(tooManyNotice ?? DEFAULT_TOO_MANY_FILES_NOTICE);
        return;
      }
      const prepared = prepareAttachments
        ? prepareAttachments(incoming, files)
        : { accepted: incoming, rejected: [] };
      if (prepared.rejected.length > 0) {
        onAttachmentRejections?.(prepared.rejected);
      }
      const merged = mergeUniqueFiles(files, prepared.accepted);
      if (merged.length < files.length + prepared.accepted.length) {
        onNotice?.(duplicateNotice ?? "File already in chat");
      }
      setFiles(merged);
    },
    [
      files,
      setFiles,
      onNotice,
      duplicateNotice,
      tooManyNotice,
      prepareAttachments,
      onAttachmentRejections,
    ],
  );
}
