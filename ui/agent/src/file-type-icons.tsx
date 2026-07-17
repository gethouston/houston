/**
 * Lucide-based, token-tinted file-type icons for the grid cards.
 * (The Finder-style list view keeps its own miniature SVGs.)
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
  type LucideIcon,
} from "lucide-react";
import { type FileCategory, fileCategory } from "./file-type";

const META: Record<FileCategory, { Icon: LucideIcon; tint: string }> = {
  pdf: { Icon: FileText, tint: "text-danger" },
  image: { Icon: FileImage, tint: "text-ink-muted" },
  code: { Icon: FileCode, tint: "text-ink-muted" },
  sheet: { Icon: FileSpreadsheet, tint: "text-success" },
  archive: { Icon: FileArchive, tint: "text-warning" },
  audio: { Icon: FileAudio, tint: "text-ink-muted" },
  video: { Icon: FileVideo, tint: "text-ink-muted" },
  doc: { Icon: FileText, tint: "text-ink-muted" },
  data: { Icon: FileJson, tint: "text-ink-muted" },
  other: { Icon: File, tint: "text-ink-muted" },
};

/** Small type glyph for a card header row. */
export function FileTypeIcon({
  extension,
  className,
}: {
  extension: string;
  className?: string;
}) {
  const { Icon, tint } = META[fileCategory(extension)];
  return (
    <Icon aria-hidden className={cn("size-4 shrink-0", tint, className)} />
  );
}

/** Large centered glyph for a card body with no thumbnail. */
export function FileTypeGlyph({ extension }: { extension: string }) {
  const { Icon, tint } = META[fileCategory(extension)];
  return (
    <Icon aria-hidden strokeWidth={1.25} className={cn("size-10", tint)} />
  );
}
