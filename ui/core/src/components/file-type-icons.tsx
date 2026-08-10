/**
 * File-type iconography shared by file surfaces: a Lucide glyph tinted with
 * its type's reserved `filetype.*` token. The tint is
 * IDENTITY, like an agent's helmet colour — never status, never decoration:
 * it is what lets a list of forty filenames read as "four PDFs and a video" at
 * a glance. Folders keep a monochrome glyph, because a folder is not a type.
 */

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

/**
 * Category -> tint utility. Written as whole class names on purpose: Tailwind
 * scans source text, so a composed `text-filetype-${x}` would never be built.
 * `data` rides the code hue (JSON/YAML are code to the eye) and `other` the
 * neutral one, which is why ten hues cover eleven categories.
 */
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
  /** Consumers that size the glyph to their own icon column (the file list's
   *  rows) override the inline 14px step here. */
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
