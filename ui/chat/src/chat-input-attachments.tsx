import {
  attachmentFolderRoot,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@houston-ai/core";
import { Plus } from "lucide-react";
import type {
  ChangeEvent,
  InputHTMLAttributes,
  ReactNode,
  RefObject,
} from "react";
import { useState } from "react";
import { AttachmentChip, FolderAttachmentChip } from "./attachment-chip";
import { fileIdentityKey } from "./clipboard-files";

// Non-standard attribute (WebKit lineage, supported by every engine we ship
// on): turns the picker into a directory picker. Unknown to React's typings,
// hence the cast; engines without it fall back to a plain file picker.
const FOLDER_INPUT_PROPS = {
  webkitdirectory: "",
} as InputHTMLAttributes<HTMLInputElement>;

interface ChatInputAttachmentsProps {
  fileInputRef: RefObject<HTMLInputElement | null>;
  folderInputRef: RefObject<HTMLInputElement | null>;
  files: File[];
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveFiles: (indices: readonly number[]) => void;
  /** Localized "N files" line for a folder chip. English default. */
  folderCountLabel?: (count: number) => string;
}

/** One chip per plain file; a whole attached folder collapses into ONE chip
 *  (removing it removes every file inside). */
interface ChipGroup {
  key: string;
  name: string;
  indices: number[];
  folder: boolean;
}

function groupAttachments(files: File[]): ChipGroup[] {
  const groups: ChipGroup[] = [];
  const folders = new Map<string, ChipGroup>();
  files.forEach((file, index) => {
    const root = attachmentFolderRoot(file);
    if (!root) {
      groups.push({
        key: `file:${fileIdentityKey(file)}`,
        name: file.name,
        indices: [index],
        folder: false,
      });
      return;
    }
    const existing = folders.get(root);
    if (existing) {
      existing.indices.push(index);
      return;
    }
    const group: ChipGroup = {
      key: `folder:${root}`,
      name: root,
      indices: [index],
      folder: true,
    };
    folders.set(root, group);
    groups.push(group);
  });
  return groups;
}

export function ChatInputAttachments({
  fileInputRef,
  folderInputRef,
  files,
  onFileChange,
  onRemoveFiles,
  folderCountLabel,
}: ChatInputAttachmentsProps) {
  const groups = groupAttachments(files);
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
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="sr-only"
        onChange={onFileChange}
        tabIndex={-1}
        {...FOLDER_INPUT_PROPS}
      />

      {groups.length > 0 && (
        <div
          className="flex gap-2 pb-1 mb-2 overflow-x-auto"
          style={{ scrollbarWidth: "thin" }}
        >
          {groups.map((group) =>
            group.folder ? (
              <FolderAttachmentChip
                key={group.key}
                name={group.name}
                countLabel={
                  folderCountLabel?.(group.indices.length) ??
                  defaultFolderCount(group.indices.length)
                }
                onRemove={() => onRemoveFiles(group.indices)}
              />
            ) : (
              <AttachmentChip
                key={group.key}
                name={group.name}
                onRemove={() => onRemoveFiles(group.indices)}
              />
            ),
          )}
        </div>
      )}
    </>
  );
}

function defaultFolderCount(count: number): string {
  return count === 1 ? "1 file" : `${count} files`;
}

type AttachMenuApi = {
  openFilePicker: () => void;
  openFolderPicker: () => void;
  close: () => void;
};

interface ChatInputAttachButtonProps {
  onOpenFilePicker: () => void;
  onOpenFolderPicker: () => void;
  /** Optional popover menu. When provided, clicking the paperclip opens a
   *  popover instead of invoking `onOpenFilePicker` directly. The render-prop
   *  form receives an API the caller uses to trigger the file or folder
   *  picker from inside the menu and close the popover. */
  attachMenu?: ReactNode | ((api: AttachMenuApi) => ReactNode);
  ariaLabel?: string;
  /** Locks the button inert (keyboard focus survives the composer's
   *  pointer-events lock, so the button must opt out on its own). */
  disabled?: boolean;
}

export function ChatInputAttachButton({
  onOpenFilePicker,
  onOpenFolderPicker,
  attachMenu,
  ariaLabel = "Attach files",
  disabled = false,
}: ChatInputAttachButtonProps) {
  const [open, setOpen] = useState(false);

  const button = (
    <button
      type="button"
      onClick={attachMenu ? undefined : onOpenFilePicker}
      disabled={disabled}
      className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-hover transition-colors disabled:pointer-events-none"
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
          openFolderPicker: () => {
            setOpen(false);
            onOpenFolderPicker();
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
