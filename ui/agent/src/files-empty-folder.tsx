/**
 * Empty-folder state, shown by BOTH views: the quiet line plus the two ways
 * out of it (put something here, or nest another folder). One filled upload
 * CTA and one quiet secondary, the same hierarchy the zero-files state uses.
 */
import {
  Button,
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@houston-ai/core";
import { FolderOpen, FolderPlus, Upload } from "lucide-react";

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
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FolderOpen aria-hidden />
        </EmptyMedia>
        <EmptyTitle className="text-base font-medium tracking-normal">
          {message}
        </EmptyTitle>
      </EmptyHeader>
      {(onUpload || onNewFolder) && (
        <EmptyContent>
          <div className="flex items-center gap-2">
            {onUpload && (
              <Button size="sm" onClick={onUpload}>
                <Upload aria-hidden /> {uploadLabel}
              </Button>
            )}
            {onNewFolder && (
              <Button variant="ghost" size="sm" onClick={onNewFolder}>
                <FolderPlus aria-hidden /> {newFolderLabel}
              </Button>
            )}
          </div>
        </EmptyContent>
      )}
    </Empty>
  );
}
