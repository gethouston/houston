import { MAX_ATTACHMENT_FILES } from "@houston-ai/core";
import { useCallback } from "react";
import type {
  AttachmentRejection,
  PrepareAttachments,
} from "./chat-panel-types";
import { mergeUniqueFiles } from "./use-file-drop-zone";

export const DEFAULT_TOO_MANY_FILES_NOTICE = `You can attach up to ${MAX_ATTACHMENT_FILES} files at a time`;

export interface AttachmentIntakeOptions {
  files: File[];
  setFiles: (files: File[]) => void;
  prepareAttachments?: PrepareAttachments;
  onAttachmentRejections?: (rejections: AttachmentRejection[]) => void;
  onNotice?: (message: string) => void;
  duplicateNotice?: string;
  tooManyNotice?: string;
}

export function ingestAttachments(
  {
    files,
    setFiles,
    prepareAttachments,
    onAttachmentRejections,
    onNotice,
    duplicateNotice,
    tooManyNotice,
  }: AttachmentIntakeOptions,
  incoming: File[],
): void {
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
    (incoming: File[]) =>
      ingestAttachments(
        {
          files,
          setFiles,
          prepareAttachments,
          onAttachmentRejections,
          onNotice,
          duplicateNotice,
          tooManyNotice,
        },
        incoming,
      ),
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
