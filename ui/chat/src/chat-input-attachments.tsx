import { attachmentFolderRoot } from "@houston-ai/core";
import {
  type ChangeEvent,
  type InputHTMLAttributes,
  type RefObject,
  useContext,
} from "react";
import { AttachmentChip, FolderAttachmentChip } from "./attachment-chip";
import {
  AttachmentProgressContext,
  type AttachmentUploadProgress,
} from "./attachment-progress";
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
  /** A chip's remove button name for `name`. English default. */
  removeLabel?: (name: string) => string;
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
  removeLabel,
}: ChatInputAttachmentsProps) {
  const groups = groupAttachments(files);
  const { progress, labels } = useContext(AttachmentProgressContext);
  const groupProgress = (
    group: ChipGroup,
  ): AttachmentUploadProgress | undefined => {
    const active = group.indices.flatMap((index) => {
      const report = progress.get(files[index]);
      return report ? [report] : [];
    });
    if (active.length === 0) return undefined;
    const total = group.indices.reduce(
      (sum, index) => sum + files[index].size,
      0,
    );
    const sent = group.indices.reduce((sum, index) => {
      const file = files[index];
      return sum + file.size * (progress.get(file)?.fraction ?? 1);
    }, 0);
    return {
      fraction: total > 0 ? sent / total : 0,
      state: active.some((p) => p.state === "reconnecting")
        ? "reconnecting"
        : active.some((p) => p.state === "uploading")
          ? "uploading"
          : "saving",
    };
  };
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
                progress={groupProgress(group)}
                labels={labels}
                countLabel={
                  folderCountLabel?.(group.indices.length) ??
                  defaultFolderCount(group.indices.length)
                }
                onRemove={() => onRemoveFiles(group.indices)}
                removeLabel={removeLabel}
              />
            ) : (
              <AttachmentChip
                key={group.key}
                name={group.name}
                progress={groupProgress(group)}
                labels={labels}
                onRemove={() => onRemoveFiles(group.indices)}
                removeLabel={removeLabel}
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
