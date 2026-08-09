import { Button } from "@houston-ai/core";
import { FolderPlus, Upload } from "lucide-react";

/** Compact inline hint for an expanded agent or folder with no rows. */
export function FilesEmptyFolder({
  message,
  onUpload,
  uploadLabel,
  onNewFolder,
  newFolderLabel,
}: {
  message: string;
  onUpload?: () => void;
  uploadLabel: string;
  onNewFolder?: () => void;
  newFolderLabel: string;
}) {
  return (
    <div className="flex min-h-13 items-center gap-2 pl-12 text-xs text-ink-muted">
      <span>{message}</span>
      {onUpload && (
        <Button variant="ghost" size="sm" onClick={onUpload}>
          <Upload aria-hidden /> {uploadLabel}
        </Button>
      )}
      {onNewFolder && (
        <Button variant="ghost" size="sm" onClick={onNewFolder}>
          <FolderPlus aria-hidden /> {newFolderLabel}
        </Button>
      )}
    </div>
  );
}
