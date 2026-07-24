/**
 * The header's promoted Upload action. Plain pill when only file picking is
 * available; with a folder handler it becomes a two-item menu (files / whole
 * folder, HOU-889) so folder upload is visible without hover or discovery.
 */
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { File, FolderUp, Upload } from "lucide-react";

export function FilesHeaderUpload({
  onUpload,
  uploadLabel,
  onUploadFolder,
  uploadFilesLabel,
  uploadFolderLabel,
}: {
  onUpload: () => void;
  uploadLabel: string;
  onUploadFolder?: () => void;
  uploadFilesLabel: string;
  uploadFolderLabel: string;
}) {
  if (!onUploadFolder) {
    return (
      <Button size="sm" onClick={onUpload} className="shrink-0">
        <Upload aria-hidden /> {uploadLabel}
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="shrink-0">
          <Upload aria-hidden /> {uploadLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onUpload}>
          <File aria-hidden /> {uploadFilesLabel}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onUploadFolder}>
          <FolderUp aria-hidden /> {uploadFolderLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
