import type {
  FileUploadOptions,
  UploadProgress,
} from "@houston/engine-adapter";
import type { AttachmentUploadProgress } from "@houston-ai/chat";
import { createStore } from "zustand/vanilla";

export type UploadDisplayProgress = ReadonlyMap<File, AttachmentUploadProgress>;

export function updateUploadProgress(
  current: UploadDisplayProgress,
  file: File,
  progress: UploadProgress,
): UploadDisplayProgress {
  const next = new Map(current);
  next.set(file, {
    fraction:
      progress.phase === "done"
        ? 1
        : progress.totalBytes > 0
          ? Math.min(1, Math.max(0, progress.sentBytes / progress.totalBytes))
          : 0,
    state: progress.phase,
  });
  return next;
}

export const attachmentUploadDisplay = createStore<UploadDisplayProgress>(
  () => new Map(),
);

export async function trackAttachmentUpload<T>(
  files: readonly File[],
  upload: (
    onProgress: NonNullable<FileUploadOptions["onProgress"]>,
  ) => Promise<T>,
): Promise<T> {
  const onProgress = (file: File, progress: UploadProgress) =>
    attachmentUploadDisplay.setState(
      (current) => updateUploadProgress(current, file, progress),
      true,
    );
  for (const file of files)
    onProgress(file, {
      sentBytes: 0,
      totalBytes: file.size,
      phase: "uploading",
    });
  try {
    return await upload(onProgress);
  } finally {
    attachmentUploadDisplay.setState((current) => {
      const next = new Map(current);
      for (const file of files) next.delete(file);
      return next;
    }, true);
  }
}
