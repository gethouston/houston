import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { formatBytes } from "../../lib/attachment-validation";
import { showExpectedStateToast } from "../../lib/error-toast";
import { isReadOnlyError } from "../../lib/file-conflicts";
import {
  isUploadTooLargeError,
  MAX_UPLOAD_FILE_BYTES,
} from "../../lib/files-upload-limits";
import i18n from "../../lib/i18n";
import { queryKeys } from "../../lib/query-keys";
import { showReadOnlyToast } from "../../lib/read-only-toast";
import { tauriFiles } from "../../lib/tauri";
import {
  type UploadDisplayProgress,
  updateUploadProgress,
} from "../../lib/upload-progress";

/**
 * An agent's file listing. Deletes, renames, moves and new folders live in
 * `use-file-writes.ts` (optimistic); uploads stay here, where their progress
 * is the honest UI.
 */
export function useFiles(agentPath: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.files(agentPath ?? ""),
    queryFn: () => {
      if (!agentPath) throw new Error("agentPath is required");
      return tauriFiles.list(agentPath);
    },
    enabled: enabled && !!agentPath,
    staleTime: 30_000,
  });
}

export function useUploadFiles(agentPath: string | undefined) {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<UploadDisplayProgress>(new Map());
  const mutation = useMutation({
    mutationFn: async ({
      files,
      targetDir,
    }: {
      files: File[];
      targetDir?: string | null;
    }) => {
      if (!agentPath) throw new Error("agentPath is required");
      setProgress((current) => {
        const next = new Map(current);
        for (const file of files)
          next.set(file, { fraction: 0, state: "uploading" });
        return next;
      });
      try {
        await tauriFiles.upload(agentPath, files, targetDir, {
          onProgress: (file, report) =>
            setProgress((current) =>
              updateUploadProgress(current, file, report),
            ),
        });
      } finally {
        setProgress((current) => {
          const next = new Map(current);
          for (const file of files) next.delete(file);
          return next;
        });
      }
    },
    onSuccess: () => {
      if (agentPath)
        qc.invalidateQueries({ queryKey: queryKeys.files(agentPath) });
    },
    // Defense in depth, and today only that: the intake rejects any single file
    // at or over the cap, and the client splits a batch into requests far below
    // it, so nothing should reach the host's 413. It stays because the two caps
    // can drift (the host lowers `MAX_UPLOAD_BYTES`, the client raises its batch
    // budget) and a drift that failed silently would be worse than a toast that
    // never fires. `tauriFiles.upload` silences the 413 (expected state, not a
    // bug) precisely so this handler can explain it in product copy; every other
    // failure already went through `call`'s red toast + Sentry report on the way
    // here, so re-toasting it would double up on the user.
    onError: (err: unknown) => {
      // A workspace that refuses every write refuses the upload too, and says
      // so in its own words — the size limit has nothing to do with it.
      if (isReadOnlyError(err)) {
        showReadOnlyToast();
        return;
      }
      if (!isUploadTooLargeError(err)) return;
      showExpectedStateToast(
        i18n.t("agents:files.uploadTooLarge.batchTitle"),
        i18n.t("agents:files.uploadTooLarge.batchDescription", {
          maxSize: formatBytes(MAX_UPLOAD_FILE_BYTES),
        }),
      );
    },
  });
  return { ...mutation, progress };
}
