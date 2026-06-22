import { useState } from "react";
import type { ChangeEvent, ReactNode, RefObject } from "react";
import { Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@houston-ai/core";
import { AttachmentChip } from "./attachment-chip";

interface ChatInputAttachmentsProps {
  fileInputRef: RefObject<HTMLInputElement | null>;
  files: File[];
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (index: number) => void;
}

export function ChatInputAttachments({
  fileInputRef,
  files,
  onFileChange,
  onRemoveFile,
}: ChatInputAttachmentsProps) {
  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="sr-only"
        onChange={onFileChange}
        tabIndex={-1}
      />

      {files.length > 0 && (
        <div
          className="flex gap-2 pb-1 mb-2 overflow-x-auto"
          style={{ scrollbarWidth: "thin" }}
        >
          {files.map((file, idx) => (
            <AttachmentChip
              key={`${file.name}-${idx}`}
              name={file.name}
              onRemove={() => onRemoveFile(idx)}
            />
          ))}
        </div>
      )}
    </>
  );
}

type AttachMenuApi = { openFilePicker: () => void; close: () => void };

interface ChatInputAttachButtonProps {
  onOpenFilePicker: () => void;
  /** Optional popover menu. When provided, clicking the paperclip opens a
   *  popover instead of invoking `onOpenFilePicker` directly. The render-prop
   *  form receives an API the caller uses to trigger the file picker from
   *  inside the menu and close the popover. */
  attachMenu?: ReactNode | ((api: AttachMenuApi) => ReactNode);
  ariaLabel?: string;
}

export function ChatInputAttachButton({
  onOpenFilePicker,
  attachMenu,
  ariaLabel = "Attach files",
}: ChatInputAttachButtonProps) {
  const [open, setOpen] = useState(false);

  const button = (
    <button
      type="button"
      onClick={attachMenu ? undefined : onOpenFilePicker}
      className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent transition-colors"
      aria-label={ariaLabel}
    >
      <Plus className="size-5" />
    </button>
  );

  if (!attachMenu) {
    return (
      <div className="flex items-center [grid-area:leading]">{button}</div>
    );
  }

  const content =
    typeof attachMenu === "function"
      ? attachMenu({
          openFilePicker: () => {
            setOpen(false);
            onOpenFilePicker();
          },
          close: () => setOpen(false),
        })
      : attachMenu;

  return (
    <div className="flex items-center [grid-area:leading]">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{button}</PopoverTrigger>
        <PopoverContent
          align="start"
          side="top"
          sideOffset={8}
          className="w-auto min-w-56 p-1.5"
        >
          {content}
        </PopoverContent>
      </Popover>
    </div>
  );
}
