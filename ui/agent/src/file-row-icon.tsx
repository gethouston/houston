/**
 * The leading icon of a list row. An image file shows its own rounded
 * thumbnail once it scrolls into view — a library of photos should look like
 * the photos, not like forty identical tiles. Everything else (and every image
 * that has not loaded, cannot load, or was never offered a preview loader)
 * keeps the outlined type tile, so a row never sits empty while bytes travel.
 * Both wear the SAME box (`ROW_TILE`), so a listing of mixed types keeps one
 * unbroken icon column.
 */
import { cn, FileTypeTile, previewKind } from "@houston-ai/core";
import { ROW_TILE, ROW_TILE_GLYPH } from "./files-list-chrome";
import type { FileEntry, LoadFilePreview } from "./types";
import { useFilePreview, useVisibleOnce } from "./use-file-preview";

function TypeTile({ file }: { file: FileEntry }) {
  return (
    <FileTypeTile
      extension={file.extension}
      className={cn("shrink-0", ROW_TILE)}
      glyphClassName={ROW_TILE_GLYPH}
    />
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
    return <TypeTile file={file} />;
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
    <div
      ref={ref}
      className={cn("flex shrink-0 items-center justify-center", ROW_TILE)}
    >
      {state.kind === "image" ? (
        <img
          src={state.url}
          alt=""
          draggable={false}
          className={cn("shrink-0 object-cover", ROW_TILE)}
        />
      ) : (
        <TypeTile file={file} />
      )}
    </div>
  );
}
