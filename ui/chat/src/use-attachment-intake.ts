import { useCallback } from "react";
import type { AttachmentRejection, PrepareAttachments } from "./chat-panel-types";
import { mergeUniqueFiles } from "./use-file-drop-zone";

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
}

export function useAttachmentIntake({
  files,
  setFiles,
  prepareAttachments,
  onAttachmentRejections,
  onNotice,
  duplicateNotice,
}: AttachmentIntakeOptions): (incoming: File[]) => void {
  return useCallback(
    (incoming: File[]) => {
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
    [files, setFiles, onNotice, duplicateNotice, prepareAttachments, onAttachmentRejections],
  );
}
