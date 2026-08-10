/**
 * The leading icon of a list row. An image file shows its own rounded
 * thumbnail once it scrolls into view — a library of photos should look like
 * the photos, not like forty identical tiles. Everything else (and every image
 * that has not loaded, cannot load, or was never offered a preview loader)
 * shows the BARE type-tinted glyph, with no tile or fill. Every mark uses the
 * same centered footprint, so mixed listings keep one unbroken icon column.
 */
import { cn, FileTypeGlyphInline, previewKind } from "@houston-ai/core";
import { ROW_MARK, ROW_TILE, ROW_TILE_GLYPH } from "./files-list-chrome";
import type { FileEntry, LoadFilePreview } from "./types";
import { useFilePreview, useVisibleOnce } from "./use-file-preview";

function TypeGlyph({ file }: { file: FileEntry }) {
  return (
    <span aria-hidden className={ROW_MARK}>
      <FileTypeGlyphInline
        extension={file.extension}
        className={ROW_TILE_GLYPH}
      />
    </span>
  );
}

export function FileRowIcon({
  file,
  loadPreview,
}: {
  file: FileEntry;
  loadPreview?: LoadFilePreview;
}) {
  // Only images earn a thumbnail slot: a text file's miniature page is
  // unreadable at this size, and observing rows that can never show one would
  // put an IntersectionObserver on every row of the workspace for nothing.
  if (!loadPreview || previewKind(file) !== "image") {
    return <TypeGlyph file={file} />;
  }
  return <FileRowThumbnail file={file} loadPreview={loadPreview} />;
}

function FileRowThumbnail({
  file,
  loadPreview,
}: {
  file: FileEntry;
  loadPreview: LoadFilePreview;
}) {
  const [ref, visible] = useVisibleOnce();
  const state = useFilePreview(file, loadPreview, visible);

  return (
    <div ref={ref} className={cn(ROW_MARK, "rounded-md")}>
      {state.kind === "image" ? (
        <img
          src={state.url}
          alt=""
          draggable={false}
          className={cn("shrink-0 object-cover", ROW_TILE)}
        />
      ) : (
        <FileTypeGlyphInline
          extension={file.extension}
          className={ROW_TILE_GLYPH}
        />
      )}
    </div>
  );
}
