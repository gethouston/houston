import type { FileEntry } from "@houston-ai/agent";
import { previewKind } from "@houston-ai/core";
import type { QueryClient } from "@tanstack/react-query";
import { tauriFiles } from "./tauri";

export interface FileBytes {
  blob: Blob;
  contentType: string;
}

export function fileBytesQueryKey(
  agentPath: string,
  filePath: string,
  dateModified: number,
): readonly unknown[] {
  return ["file-bytes", agentPath, filePath, dateModified];
}

export function sharedBytesKey(file: FileEntry): number | undefined {
  return previewKind(file) === null ? undefined : file.dateModified;
}

export function fetchFileBytes(
  queryClient: QueryClient,
  agentPath: string,
  filePath: string,
  dateModified: number | undefined,
): Promise<FileBytes> {
  const download = () =>
    tauriFiles.download(agentPath, filePath, {
      toast: false,
    });
  if (dateModified === undefined) return download();
  return queryClient.fetchQuery({
    queryKey: fileBytesQueryKey(agentPath, filePath, dateModified),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 5 * 60_000,
    queryFn: download,
  });
}
