/**
 * The toolbar's one filled action: "New", a black pill opening everything that
 * ADDS to the workspace — upload files, upload a folder, create a folder. One
 * primary affordance instead of three competing pills is what lets the rest of
 * the row fall back to quiet glyphs.
 *
 * It renders on an EMPTY workspace too: creating the first folder there has to
 * come from somewhere. While an upload is in flight the trigger states it and
 * stops taking new picks; browsing the workspace stays untouched.
 */
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Spinner,
} from "@houston-ai/core";
import { ChevronDown, FolderPlus, FolderUp, Upload } from "lucide-react";

export function FilesNewMenu({
  label,
  onUpload,
  uploadFilesLabel,
  onUploadFolder,
  uploadFolderLabel,
  onNewFolder,
  newFolderLabel,
  uploading,
  uploadingLabel,
}: {
  label: string;
  onUpload?: () => void;
  uploadFilesLabel: string;
  onUploadFolder?: () => void;
  uploadFolderLabel: string;
  onNewFolder?: () => void;
  newFolderLabel: string;
  /** An upload is in flight: busy label + disabled trigger. */
  uploading?: boolean;
  uploadingLabel: string;
}) {
  // Nothing to add, no way to add it: the pill would open an empty menu.
  if (!onUpload && !onUploadFolder && !onNewFolder) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            disabled={uploading}
            aria-busy={uploading}
            className="shrink-0"
          >
            {uploading ? (
              <>
                <Spinner aria-hidden className="size-4" /> {uploadingLabel}
              </>
            ) : (
              <>
                {label} <ChevronDown aria-hidden className="size-4" />
              </>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {onUpload && (
            <DropdownMenuItem onSelect={onUpload}>
              <Upload aria-hidden /> {uploadFilesLabel}
            </DropdownMenuItem>
          )}
          {onUploadFolder && (
            <DropdownMenuItem onSelect={onUploadFolder}>
              <FolderUp aria-hidden /> {uploadFolderLabel}
            </DropdownMenuItem>
          )}
          {onNewFolder && (
            <DropdownMenuItem onSelect={onNewFolder}>
              <FolderPlus aria-hidden /> {newFolderLabel}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {/* The spinner is decorative; the busy state is announced by ONE polite
          live region sitting outside the aria-busy trigger (which would gate
          updates to anything nested inside it). */}
      <output className="sr-only">{uploading ? uploadingLabel : ""}</output>
    </>
  );
}
