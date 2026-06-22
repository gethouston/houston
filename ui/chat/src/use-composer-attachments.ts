import type { ChangeEvent, ClipboardEvent, RefObject } from "react";
import { useCallback, useRef } from "react";
import type {
  AttachmentRejection,
  ChatComposerLabels,
  PrepareAttachments,
} from "./chat-panel-types";
import { resolveClipboardPaste } from "./clipboard-files";
import { useAttachmentIntake } from "./use-attachment-intake";
import { useControllable } from "./use-file-drop-zone";

/**
 * The composer's full attachment surface: controlled-or-internal file
 * state plus the picker and clipboard-paste handlers. `ChatPanel`'s
 * panel-wide drop zone shares only the ingest core (`useAttachmentIntake`);
 * the picker/paste affordances are composer-specific and live here.
 */
export interface ComposerAttachmentsOptions {
  attachments?: File[];
  onAttachmentsChange?: (files: File[]) => void;
  prepareAttachments?: PrepareAttachments;
  onAttachmentRejections?: (rejections: AttachmentRejection[]) => void;
  onNotice?: (message: string) => void;
  labels?: ChatComposerLabels;
}

export interface ComposerAttachments {
  files: File[];
  setFiles: (files: File[]) => void;
  isFilesControlled: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  handleFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  handlePaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  openFilePicker: () => void;
  removeFile: (index: number) => void;
}

export function useComposerAttachments({
  attachments,
  onAttachmentsChange,
  prepareAttachments,
  onAttachmentRejections,
  onNotice,
  labels,
}: ComposerAttachmentsOptions): ComposerAttachments {
  const [files, setFiles] = useControllable<File[]>(
    attachments,
    onAttachmentsChange,
    [],
  );
  const isFilesControlled = attachments !== undefined;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useAttachmentIntake({
    files,
    setFiles,
    prepareAttachments,
    onAttachmentRejections,
    onNotice,
    duplicateNotice: labels?.fileAlreadyInChat,
  });

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return;
      addFiles(Array.from(e.target.files));
      e.target.value = "";
    },
    [addFiles],
  );

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const outcome = resolveClipboardPaste(e.clipboardData);
      if (outcome.kind === "ignore") return;
      e.preventDefault();
      if (outcome.kind === "files") {
        addFiles(outcome.files);
        return;
      }
      onNotice?.(
        labels?.imagePasteUnavailable ??
          "Couldn't read the pasted image. Try dragging the file in instead.",
      );
    },
    [addFiles, onNotice, labels],
  );

  const openFilePicker = useCallback(() => {
    const input = fileInputRef.current;
    if (!input) return;
    // Reset BEFORE click so the same file can be re-picked and so WKWebView
    // doesn't hold onto stale state between invocations.
    input.value = "";
    input.click();
  }, []);

  const removeFile = useCallback(
    (index: number) => setFiles(files.filter((_, i) => i !== index)),
    [files, setFiles],
  );

  return {
    files,
    setFiles,
    isFilesControlled,
    fileInputRef,
    handleFileChange,
    handlePaste,
    openFilePicker,
    removeFile,
  };
}
