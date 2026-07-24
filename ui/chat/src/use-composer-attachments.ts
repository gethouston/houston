import { visibleAttachmentFiles } from "@houston-ai/core";
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
  folderInputRef: RefObject<HTMLInputElement | null>;
  handleFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  handlePaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  openFilePicker: () => void;
  openFolderPicker: () => void;
  removeFiles: (indices: readonly number[]) => void;
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
  const folderInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useAttachmentIntake({
    files,
    setFiles,
    prepareAttachments,
    onAttachmentRejections,
    onNotice,
    duplicateNotice: labels?.fileAlreadyInChat,
    tooManyNotice: labels?.tooManyFiles,
  });

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return;
      // A folder pick sweeps in hidden files (.DS_Store, .git/**) the host
      // refuses — filter them here; plain picks pass through untouched.
      const picked = visibleAttachmentFiles(Array.from(e.target.files));
      if (picked.length > 0) addFiles(picked);
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

  const openFolderPicker = useCallback(() => {
    const input = folderInputRef.current;
    if (!input) return;
    input.value = "";
    input.click();
  }, []);

  // Index-set removal (not single-index): a folder chip removes every file of
  // that folder in ONE state update.
  const removeFiles = useCallback(
    (indices: readonly number[]) => {
      const drop = new Set(indices);
      setFiles(files.filter((_, i) => !drop.has(i)));
    },
    [files, setFiles],
  );

  return {
    files,
    setFiles,
    isFilesControlled,
    fileInputRef,
    folderInputRef,
    handleFileChange,
    handlePaste,
    openFilePicker,
    openFolderPicker,
    removeFiles,
  };
}
