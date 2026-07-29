/**
 * One cache for workspace-file bytes, shared by the two surfaces that can
 * download the SAME file: the Files-tab grid thumbnails (`useFilePreviewLoader`)
 * and the in-app preview dialog (`FilePreviewDialog`). Before this, opening a
 * file whose thumbnail had just been fetched downloaded the exact same bytes a
 * second time (HOU-970).
 *
 * Blobs live in the query cache briefly (five minutes), so two rules keep it
 * from turning into a memory hazard:
 *
 * 1. **Keyed per file + mtime, cached only when there IS an mtime.** Bytes are
 *    immutable for a given `dateModified`, so an edited file lands on a fresh
 *    key. Callers with no mtime to key on (chat-opened previews, which carry
 *    only a path) bypass the cache entirely: a placeholder key would serve
 *    stale bytes, and caching them as always-stale would pin blobs in memory
 *    for zero reuse.
 * 2. **Only files the grid could have thumbnailed.** `previewKind` bounds what
 *    a thumbnail ever fetches (small images, small text). Anything outside it,
 *    say an 80 MB deck opened for the dialog's "download to open" fallback, can
 *    never share bytes with a thumbnail, so it streams straight through. Ask
 *    `sharedBytesKey` rather than reaching for `dateModified` directly.
 */
import { type FileEntry, previewKind } from "@houston-ai/agent";
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

/**
 * The cache key a preview surface may reuse for `file`, or `undefined` when its
 * bytes must not be cached: unbounded files (no `previewKind`) and files whose
 * mtime is unknown, which is what makes an entry safely immutable.
 */
export function sharedBytesKey(file: FileEntry): number | undefined {
  return previewKind(file) === null ? undefined : file.dateModified;
}

/**
 * Fetch a file's bytes, through the query cache when `dateModified` keys a
 * cacheable entry (see `sharedBytesKey`) and directly otherwise. `{ toast:
 * false }` because every caller renders the failure itself (inline error state,
 * or the card's type-icon fallback); the engine layer still reports it to
 * Sentry.
 */
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
