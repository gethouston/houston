/**
 * Loader for the Files-tab grid card thumbnails. Classifies by extension
 * (previewKind), fetches bytes over the authenticated download route, and
 * caches per file+mtime in the query cache so scrolling back is instant.
 * Edited files get a fresh cache entry via the dateModified key segment;
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
import { tauriFiles } from "../lib/tauri";

export function useFilePreviewLoader(
  agentPath: string | undefined,
): LoadFilePreview {
  const queryClient = useQueryClient();
  return useCallback(
    (file: FileEntry): Promise<FilePreviewData | null> => {
      if (!agentPath) return Promise.resolve(null);
      const kind = previewKind(file);
      if (!kind) return Promise.resolve(null);
      // Errors intentionally propagate: the card falls back to its type icon,
      // and any real failure surfaces when the user opens the file.
      return queryClient.fetchQuery({
        queryKey: [
          "file-preview",
          agentPath,
          file.path,
          file.dateModified ?? 0,
        ],
        staleTime: Number.POSITIVE_INFINITY,
        queryFn: async (): Promise<FilePreviewData | null> => {
          const { blob, contentType } = await tauriFiles.download(
            agentPath,
            file.path,
            { toast: false },
          );
          if (kind === "image") {
            return contentType.startsWith("image/")
              ? { kind: "image", blob }
              : null;
          }
          const text = await blob.slice(0, TEXT_PREVIEW_SLICE_BYTES).text();
          return { kind: "text", text };
        },
      });
    },
    [agentPath, queryClient],
  );
}
