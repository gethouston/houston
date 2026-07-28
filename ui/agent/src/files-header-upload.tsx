/**
 * The header's promoted Upload action. Plain pill when only file picking is
 * available; with a folder handler it becomes a two-item menu (files / whole
 * folder, HOU-889) so folder upload is visible without hover or discovery.
 * While an upload is in flight the pill states it and stops taking new picks;
 * browsing the workspace stays untouched.
 */
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Spinner,
} from "@houston-ai/core";
import { File, FolderUp, Upload } from "lucide-react";

export function FilesHeaderUpload({
  onUpload,
  uploadLabel,
  onUploadFolder,
  uploadFilesLabel,
  uploadFolderLabel,
  uploading,
  uploadingLabel,
}: {
  onUpload: () => void;
  uploadLabel: string;
  onUploadFolder?: () => void;
  uploadFilesLabel: string;
  uploadFolderLabel: string;
  /** An upload is in flight: busy label + disabled trigger. */
  uploading?: boolean;
  uploadingLabel: string;
}) {
  const icon = uploading ? <Spinner aria-hidden /> : <Upload aria-hidden />;
  const label = uploading ? uploadingLabel : uploadLabel;
  // The spinner is decorative; the busy state is announced by ONE polite live
  // region sitting outside the aria-busy button (which would gate updates to
  // anything nested inside it).
  const busyAnnouncement = (
    <output className="sr-only">{uploading ? uploadingLabel : ""}</output>
  );

  if (!onUploadFolder) {
    return (
      <>
        <Button
          size="sm"
          onClick={onUpload}
          disabled={uploading}
          aria-busy={uploading}
          className="shrink-0"
        >
          {icon} {label}
        </Button>
        {busyAnnouncement}
      </>
    );
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            disabled={uploading}
            aria-busy={uploading}
            className="shrink-0"
          >
            {icon} {label}
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
      {busyAnnouncement}
    </>
  );
}
