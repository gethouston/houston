/**
 * Zero-files state for the Files tab: headline, hint, and a dashed drop panel
 * holding the filled Browse CTA, the quiet whole-folder upload beside it
 * (HOU-889) and the drag-and-drop hint. The panel is only the affordance —
 * the drop itself is handled by the container in FilesBrowser, which wraps
 * this state too, so an empty workspace accepts a drop like any other.
 */
import {
  Button,
  cn,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Spinner,
} from "@houston-ai/core";
import { FolderUp, Upload } from "lucide-react";

export function FilesEmptyState({
  title,
  description,
  browseLabel,
  onBrowse,
  folderLabel,
  onBrowseFolder,
  dropHint,
  dragActive,
  uploading,
  uploadingLabel,
}: {
  title: string;
  description: string;
  browseLabel: string;
  onBrowse?: () => void;
  folderLabel?: string;
  onBrowseFolder?: () => void;
  /** "or drag and drop files here" — the visible drop affordance. */
  dropHint: string;
  /** A drag is hovering the browser: tint the panel like a drop target. */
  dragActive?: boolean;
  /** An upload is in flight: the CTAs go busy, browsing stays free. */
  uploading?: boolean;
  uploadingLabel: string;
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Upload aria-hidden />
        </EmptyMedia>
        <EmptyTitle className="text-lg font-medium tracking-normal">
          {title}
        </EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="max-w-md">
        <div
          className={cn(
            "flex w-full flex-col items-center gap-3 rounded-xl border border-line border-dashed px-6 py-8 transition-colors",
            dragActive && "border-focus bg-focus/10",
          )}
        >
          {(onBrowse || onBrowseFolder) && (
            <div className="flex items-center gap-2">
              {onBrowse && (
                <Button
                  size="sm"
                  onClick={onBrowse}
                  disabled={uploading}
                  aria-busy={uploading}
                >
                  {uploading ? (
                    <Spinner aria-hidden className="mr-1.5 size-4" />
                  ) : (
                    <Upload aria-hidden className="mr-1.5 size-4" />
                  )}
                  {uploading ? uploadingLabel : browseLabel}
                </Button>
              )}
              {onBrowseFolder && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onBrowseFolder}
                  disabled={uploading}
                >
                  <FolderUp aria-hidden className="mr-1.5 size-4" />{" "}
                  {folderLabel}
                </Button>
              )}
            </div>
          )}
          <p className="text-xs text-ink-muted">{dropHint}</p>
        </div>
      </EmptyContent>
      {/* The busy state has to reach someone: one polite live region, outside
          the aria-busy button, is the whole mechanism. */}
      <output className="sr-only">{uploading ? uploadingLabel : ""}</output>
    </Empty>
  );
}
