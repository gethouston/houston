/**
 * Lucide file-type glyphs shared by BOTH views (grid cards and list rows).
 * Near-monochrome on purpose: a tinted glyph would be decorative colour on a
 * content surface, so file type is carried by the icon's shape alone.
 */
import { cn } from "@houston-ai/core";
import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileJson,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  type LucideIcon,
} from "lucide-react";
import { type FileCategory, fileCategory } from "./file-type";

const ICONS: Record<FileCategory, LucideIcon> = {
  pdf: FileText,
  image: FileImage,
  code: FileCode,
  sheet: FileSpreadsheet,
  archive: FileArchive,
  audio: FileAudio,
  video: FileVideo,
  doc: FileText,
  data: FileJson,
  other: File,
};

/** Small type glyph for a card header row or a list row. */
export function FileTypeIcon({
  extension,
  className,
}: {
  extension: string;
  className?: string;
}) {
  const Icon = ICONS[fileCategory(extension)];
  return (
    <Icon
      aria-hidden
      className={cn("size-4 shrink-0 text-ink-muted", className)}
    />
  );
}

/** Large centered glyph for a card body with no thumbnail. */
export function FileTypeGlyph({ extension }: { extension: string }) {
  const Icon = ICONS[fileCategory(extension)];
  return (
    <Icon aria-hidden strokeWidth={1.25} className="size-10 text-ink-muted" />
  );
}

/** Folder glyph: the same outline style in the grid and the list. */
export function FolderGlyph({ small }: { small?: boolean }) {
  return (
    <Folder
      aria-hidden
      strokeWidth={small ? 2 : 1}
      className={cn(
        "fill-chip text-ink-muted",
        small ? "size-4 shrink-0" : "size-12",
      )}
    />
  );
}
