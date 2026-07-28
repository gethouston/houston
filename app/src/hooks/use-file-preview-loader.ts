/**
 * Loader for the Files-tab grid card thumbnails. Classifies by extension
 * (previewKind) and reads bytes through the shared per file+mtime byte cache
 * (`lib/file-bytes-cache.ts`), so scrolling back is instant AND opening the
 * same file in the preview dialog reuses the bytes instead of downloading them
 * again. Edited files get a fresh cache entry via the dateModified key segment;
 * stale entries age out through the default gcTime.
 */
import {
  type FileEntry,
  type FilePreviewData,
  type LoadFilePreview,
  previewKind,
  TEXT_PREVIEW_SLICE_BYTES,
} from "@houston-ai/agent";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { fetchFileBytes } from "../lib/file-bytes-cache";

export function useFilePreviewLoader(
  agentPath: string | undefined,
): LoadFilePreview {
  const queryClient = useQueryClient();
  return useCallback(
    async (file: FileEntry): Promise<FilePreviewData | null> => {
      if (!agentPath) return null;
      const kind = previewKind(file);
      if (!kind) return null;
      // `kind` is non-null here, so this is exactly `sharedBytesKey(file)`:
      // the bytes are cacheable whenever the entry carries an mtime.
      // Errors intentionally propagate: the card falls back to its type icon,
      // and any real failure surfaces when the user opens the file.
      const { blob, contentType } = await fetchFileBytes(
        queryClient,
        agentPath,
        file.path,
        file.dateModified,
      );
      if (kind === "image") {
        return contentType.startsWith("image/")
          ? { kind: "image", blob }
          : null;
      }
      const text = await blob.slice(0, TEXT_PREVIEW_SLICE_BYTES).text();
      return { kind: "text", text };
    },
    [agentPath, queryClient],
  );
}
