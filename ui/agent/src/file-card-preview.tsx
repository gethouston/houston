/**
 * The grid card's hero thumbnail: renders whatever `useFilePreview` resolved
 * once the card scrolled into view. Images render as cover thumbnails, text-ish
 * files as a miniature page; anything else (or any load failure) falls back to
 * the type glyph. The fetching itself lives in use-file-preview.ts, shared with
 * the list row's icon.
 */
import { FileTypeGlyph } from "@houston-ai/core";
import type { FileEntry, LoadFilePreview } from "./types";
import { useFilePreview, useVisibleOnce } from "./use-file-preview";

export function CardPreview({
  file,
  loadPreview,
}: {
  file: FileEntry;
  loadPreview?: LoadFilePreview;
}) {
  const [ref, visible] = useVisibleOnce();
  const state = useFilePreview(file, loadPreview, visible);

  return (
    <div ref={ref} className="h-full w-full">
      {state.kind === "image" ? (
        <img
          src={state.url}
          alt=""
          draggable={false}
          className="h-full w-full object-cover"
        />
      ) : state.kind === "text" ? (
        <div className="h-full w-full overflow-hidden bg-input px-3 py-2.5">
          <pre className="whitespace-pre-wrap break-words font-sans text-[6px] leading-[9px] text-ink/70">
            {state.text}
          </pre>
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <FileTypeGlyph extension={file.extension} />
        </div>
      )}
    </div>
  );
}
