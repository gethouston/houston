/**
 * Zero-files state for the Files tab: headline, hint, optional Browse CTA.
 */
import { Button } from "@houston-ai/core";
import { Upload } from "lucide-react";

export function FilesEmptyState({
  title,
  description,
  browseLabel,
  onBrowse,
}: {
  title: string;
  description: string;
  browseLabel: string;
  onBrowse?: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-4 px-8 pt-[20vh]">
      <div className="max-w-md space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-ink-muted">{description}</p>
      </div>
      {onBrowse && (
        <Button variant="default" size="sm" onClick={onBrowse}>
          <Upload className="mr-1.5 size-4" /> {browseLabel}
        </Button>
      )}
    </div>
  );
}
