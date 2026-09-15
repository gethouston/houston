import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatBytes } from "../../lib/attachment-validation";
import { showExpectedStateToast } from "../../lib/error-toast";
import { fileRefusal, isReadOnlyError } from "../../lib/file-conflicts";
import {
  isUploadTooLargeError,
  MAX_UPLOAD_FILE_BYTES,
} from "../../lib/files-upload-limits";
import i18n from "../../lib/i18n";
import { showNameTakenToast } from "../../lib/name-taken-toast";
import { queryKeys } from "../../lib/query-keys";
import { showReadOnlyToast } from "../../lib/read-only-toast";
import { tauriFiles } from "../../lib/tauri";

/**
 * Explain a refused write in the person's own terms — the host's two
 * `FileOpCode`s, each with the copy it earns:
 *
 *  - `name_taken`: the race the listing cannot close. Callers detect the
 *    collision up front (`detectRenameConflict` / `detectMoveConflict`), so
 *    reaching the host's 409 means the world moved underneath them — still
 *    their state, not a Houston bug, so it gets the SAME sentence the up-front
 *    check shows. Silenced for Sentry in `tauriFiles`.
 *  - `read_only`: the workspace folder refuses every write. Reported (not
 *    silenced) AND explained — see `read-only-toast.ts`.
 *
 * Anything else already took `call`'s report path on the way here and must not
 * be toasted twice. `name` is the entry the write was aiming at.
 *
 * Lives in the mutations rather than at the call sites so EVERY caller is
 * covered (the inline rename and the move dialog's Keep both alike), and
 * surfacing only: `onError` never swallows, so an awaiting caller still sees
 * the rejection.
 */
function surfaceFileRefusal(err: unknown, name: string): void {
  switch (fileRefusal(err)) {
    case "name_taken":
      showNameTakenToast(name);
      return;
    case "read_only":
      showReadOnlyToast();
      return;
    default:
      return;
  }
}

/** The entry a path points at, for the copy that names it. */
const lastSegment = (path: string) => path.split("/").pop() ?? path;

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
    // A delete cannot collide with a name, but it CAN meet a workspace that
    // refuses every write — the one state the person could otherwise only read
    // as a row that quietly stayed put.
    onError: (err: unknown) => {
      if (isReadOnlyError(err)) showReadOnlyToast();
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
    onError: (err: unknown, { newName }) => surfaceFileRefusal(err, newName),
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
    onError: (err: unknown, name: string) =>
      surfaceFileRefusal(err, lastSegment(name)),
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
    onError: (err: unknown, { relativePath }) =>
      surfaceFileRefusal(err, lastSegment(relativePath)),
  });
}
