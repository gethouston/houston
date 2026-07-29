import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatBytes } from "../../lib/attachment-validation";
import { showExpectedStateToast } from "../../lib/error-toast";
import {
  isUploadTooLargeError,
  MAX_UPLOAD_FILE_BYTES,
} from "../../lib/files-upload-limits";
import i18n from "../../lib/i18n";
import { queryKeys } from "../../lib/query-keys";
import { tauriFiles } from "../../lib/tauri";

export function useFiles(agentPath: string | undefined) {
  return useQuery({
    queryKey: queryKeys.files(agentPath ?? ""),
    queryFn: () => {
      if (!agentPath) throw new Error("agentPath is required");
      return tauriFiles.list(agentPath);
    },
    enabled: !!agentPath,
    staleTime: 30_000,
  });
}

export function useDeleteFile(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (relativePath: string) => {
      if (!agentPath) throw new Error("agentPath is required");
      return tauriFiles.delete(agentPath, relativePath);
    },
    onSuccess: () => {
      if (agentPath)
        qc.invalidateQueries({ queryKey: queryKeys.files(agentPath) });
    },
  });
}

export function useRenameFile(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      relativePath,
      newName,
    }: {
      relativePath: string;
      newName: string;
    }) => {
      if (!agentPath) throw new Error("agentPath is required");
      return tauriFiles.rename(agentPath, relativePath, newName);
    },
    onSuccess: () => {
      if (agentPath)
        qc.invalidateQueries({ queryKey: queryKeys.files(agentPath) });
    },
  });
}

export function useCreateFolder(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => {
      if (!agentPath) throw new Error("agentPath is required");
      return tauriFiles.createFolder(agentPath, name);
    },
    onSuccess: () => {
      if (agentPath)
        qc.invalidateQueries({ queryKey: queryKeys.files(agentPath) });
    },
  });
}

export function useUploadFiles(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      files,
      targetDir,
    }: {
      files: File[];
      targetDir?: string | null;
    }) => {
      if (!agentPath) throw new Error("agentPath is required");
      return tauriFiles.upload(agentPath, files, targetDir);
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
      if (!isUploadTooLargeError(err)) return;
      showExpectedStateToast(
        i18n.t("agents:files.uploadTooLarge.batchTitle"),
        i18n.t("agents:files.uploadTooLarge.batchDescription", {
          maxSize: formatBytes(MAX_UPLOAD_FILE_BYTES),
        }),
      );
    },
  });
}

export function useMoveFile(agentPath: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      relativePath,
      toDir,
    }: {
      relativePath: string;
      toDir: string | null;
    }) => {
      if (!agentPath) throw new Error("agentPath is required");
      return tauriFiles.move(agentPath, relativePath, toDir);
    },
    onSuccess: () => {
      if (agentPath)
        qc.invalidateQueries({ queryKey: queryKeys.files(agentPath) });
    },
  });
}
