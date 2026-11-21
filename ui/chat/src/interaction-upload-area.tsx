"use client";

import { cn } from "@houston-ai/core";
import { Plus } from "lucide-react";
import type { DragEvent, DragEventHandler } from "react";
import { useEffect } from "react";
import { ChatInputAttachments } from "./chat-input-attachments";
import type { CardAttach } from "./use-card-attachments";
import { useFileDropZone } from "./use-file-drop-zone";

export function InteractionUploadArea({
  attach,
  files,
  label,
  disabled,
}: {
  attach: CardAttach;
  files: readonly File[];
  label: string;
  disabled: boolean;
}) {
  const { isDraggingOver, dropProps, reset } = useFileDropZone(
    attach.addDroppedFiles,
    attach.onDropError,
  );
  useEffect(() => {
    if (disabled) reset();
  }, [disabled, reset]);
  const own =
    (handler: DragEventHandler): DragEventHandler =>
    (e: DragEvent) => {
      handler(e);
      if (e.dataTransfer.types.includes("Files")) e.stopPropagation();
    };
  const drop = disabled
    ? {}
    : {
        onDragEnter: own(dropProps.onDragEnter),
        onDragOver: own(dropProps.onDragOver),
        onDragLeave: own(dropProps.onDragLeave),
        onDrop: own(dropProps.onDrop),
      };
  const shown = [...files];
  const removeShown = (indices: readonly number[]) => {
    const gone = new Set(indices.map((i) => shown[i]));
    attach.setFiles(attach.files.filter((f) => !gone.has(f)));
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        className={cn(
          "group relative flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-line-input border-dashed px-4 py-6 outline-none md:py-8",
          "transition-[scale] duration-(--ht-duration-press) ease-out active:scale-[0.98] motion-reduce:transition-none",
          "focus-visible:ring-[3px] focus-visible:ring-focus/50",
          "disabled:pointer-events-none disabled:opacity-50 data-[dragging]:border-focus",
        )}
        data-dragging={(isDraggingOver && !disabled) || undefined}
        disabled={disabled}
        onClick={attach.openFilePicker}
        type="button"
        {...drop}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit] bg-hover opacity-0 transition-opacity duration-(--ht-duration-fast) ease-(--ht-easing-entrance) group-hover:opacity-60 group-data-[dragging]:opacity-100"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none relative flex size-10 items-center justify-center rounded-full bg-chip text-ink transition-transform duration-(--ht-duration-fast) ease-(--ht-easing-entrance) group-data-[dragging]:scale-110 motion-reduce:transition-none"
        >
          <Plus className="size-5" />
        </span>
        <span className="pointer-events-none relative font-medium text-ink text-sm">
          {label}
        </span>
      </button>
      <ChatInputAttachments
        files={shown}
        fileInputRef={attach.fileInputRef}
        folderCountLabel={attach.labels?.folderFileCount}
        folderInputRef={attach.folderInputRef}
        onFileChange={attach.handleFileChange}
        onRemoveFiles={removeShown}
        removeLabel={attach.labels?.removeAttachment}
      />
    </div>
  );
}
