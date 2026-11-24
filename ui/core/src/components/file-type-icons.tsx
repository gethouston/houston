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
  Presentation,
} from "lucide-react";
import { type FileCategory, fileCategory } from "../file-type";
import { cn } from "../utils";

const ICONS: Record<FileCategory, LucideIcon> = {
  pdf: FileText,
  image: FileImage,
  code: FileCode,
  sheet: FileSpreadsheet,
  slide: Presentation,
  archive: FileArchive,
  audio: FileAudio,
  video: FileVideo,
  doc: FileText,
  data: FileJson,
  other: File,
};

const TINTS: Record<FileCategory, string> = {
  pdf: "text-filetype-pdf",
  image: "text-filetype-image",
  code: "text-filetype-code",
  sheet: "text-filetype-sheet",
  slide: "text-filetype-slide",
  archive: "text-filetype-archive",
  audio: "text-filetype-audio",
  video: "text-filetype-video",
  doc: "text-filetype-doc",
  data: "text-filetype-code",
  other: "text-filetype-generic",
};

/**
 * Text-sized glyph for a file named INLINE in prose (chat's file chip). Keeps
 * its type tint. At 14px the tint is a hint of hue on a hairline mark, not
 * colour poured onto a content surface.
 */
export function FileTypeGlyphInline({
  extension,
  className,
}: {
  extension: string;
  className?: string;
}) {
  const category = fileCategory(extension);
  const Icon = ICONS[category];
  return (
    <Icon
      aria-hidden
      strokeWidth={2}
      className={cn("size-3.5 shrink-0", TINTS[category], className)}
    />
  );
}

/** Folder glyph: the same outline style in the grid and the list. */
export function FolderGlyph({
  small,
  className,
}: {
  small?: boolean;
  className?: string;
}) {
  return (
    <Folder
      aria-hidden
      strokeWidth={small ? 2 : 1}
      className={cn(
        "fill-chip text-ink-muted",
        small ? "size-4 shrink-0" : "size-12",
        className,
      )}
    />
  );
}
