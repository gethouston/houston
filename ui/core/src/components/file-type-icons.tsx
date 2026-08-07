/**
 * File-type iconography shared by BOTH views: an outlined tile carrying a
 * Lucide glyph tinted with its type's reserved `filetype.*` token. The tint is
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

/** The tile itself: a paper chip hairlined against the row, in both themes. */
const TILE_CLASS =
  "flex shrink-0 items-center justify-center rounded-lg border border-line-input bg-input";

/**
 * Type tile for a list row (32px) or a grid card's title row (`small`, 28px).
 * The glyph inside stays on the Lucide 20/16px steps.
 */
export function FileTypeTile({
  extension,
  small,
  className,
  glyphClassName,
}: {
  extension: string;
  small?: boolean;
  className?: string;
  /** The list scales the glyph with its tile (see files-list-chrome). */
  glyphClassName?: string;
}) {
  const category = fileCategory(extension);
  const Icon = ICONS[category];
  return (
    <span
      aria-hidden
      className={cn(TILE_CLASS, small ? "size-7" : "size-8", className)}
    >
      <Icon
        className={cn(
          small ? "size-4" : "size-5",
          glyphClassName,
          TINTS[category],
        )}
        strokeWidth={1.75}
      />
    </span>
  );
}

/**
 * Large centered glyph for a card body with no thumbnail. Stays MONOCHROME:
 * the tile above it already states the type, and a 40px tinted glyph on the
 * preview panel would be decorative colour filling a content surface.
 */
export function FileTypeGlyph({ extension }: { extension: string }) {
  const Icon = ICONS[fileCategory(extension)];
  return (
    <Icon aria-hidden strokeWidth={1.25} className="size-10 text-ink-muted" />
  );
}

/**
 * Text-sized glyph for a file named INLINE in prose (chat's file chip). Keeps
 * its type TINT, unlike {@link FileTypeGlyph}: that one is monochrome because
 * the tile above it already states the type, whereas inline there is no tile —
 * the glyph is the only thing carrying it. At 14px the tint is a hint of hue
 * on a hairline mark, not colour poured onto a content surface.
 */
export function FileTypeGlyphInline({ extension }: { extension: string }) {
  const category = fileCategory(extension);
  const Icon = ICONS[category];
  return (
    <Icon
      aria-hidden
      strokeWidth={2}
      className={cn("size-3.5 shrink-0", TINTS[category])}
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
