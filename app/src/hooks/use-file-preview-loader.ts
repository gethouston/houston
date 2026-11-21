import type {
  FileEntry,
  FilePreviewData,
  LoadFilePreview,
} from "@houston-ai/agent";
import { previewKind, TEXT_PREVIEW_SLICE_BYTES } from "@houston-ai/core";
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
