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
