/**
 * Move-with-conflict flow for the Files tab: a drop that would collide with
 * an existing entry opens a Replace / Keep both dialog instead of hitting
 * the host's 409. Replace deletes the occupant then moves; Keep both renames
 * the moved item to a free "name (n)" first. Step failures surface through
 * the tauriFiles call() toasts like every other files op.
 */
import type { FileEntry } from "@houston-ai/agent";
import { useCallback, useState } from "react";
import { detectMoveConflict, keepBothName } from "../lib/file-conflicts";
import { useDeleteFile, useMoveFile, useRenameFile } from "./queries";

export interface PendingMove {
  sourcePath: string;
  toDir: string | null;
  /** The colliding name shown in the dialog. */
  name: string;
  targetPath: string;
}

export function useMoveWithConflict(
  agentPath: string | undefined,
  files: readonly FileEntry[] | undefined,
) {
  const moveFile = useMoveFile(agentPath);
  const deleteFile = useDeleteFile(agentPath);
  const renameFile = useRenameFile(agentPath);
  const [pending, setPending] = useState<PendingMove | null>(null);

  const requestMove = useCallback(
    (sourcePath: string, toDir: string | null) => {
      const conflict = detectMoveConflict(files ?? [], sourcePath, toDir);
      if (conflict.kind === "noop") return;
      if (conflict.kind === "conflict") {
        setPending({
          sourcePath,
          toDir,
          name: conflict.name,
          targetPath: conflict.targetPath,
        });
        return;
      }
      moveFile.mutate({ relativePath: sourcePath, toDir });
    },
    [files, moveFile],
  );

  const replace = useCallback(async () => {
    if (!pending) return;
    setPending(null);
    try {
      await deleteFile.mutateAsync(pending.targetPath);
    } catch {
      return; // call() toasted; nothing was moved
    }
    moveFile.mutate({ relativePath: pending.sourcePath, toDir: pending.toDir });
  }, [pending, deleteFile, moveFile]);

  const keepBoth = useCallback(async () => {
    if (!pending) return;
    setPending(null);
    const newName = keepBothName(
      files ?? [],
      pending.sourcePath,
      pending.toDir,
    );
    try {
      await renameFile.mutateAsync({
        relativePath: pending.sourcePath,
        newName,
      });
    } catch {
      return; // call() toasted; the item keeps its old name and place
    }
    const slash = pending.sourcePath.lastIndexOf("/");
    const renamedPath =
      slash === -1
        ? newName
        : `${pending.sourcePath.slice(0, slash)}/${newName}`;
    moveFile.mutate({ relativePath: renamedPath, toDir: pending.toDir });
  }, [pending, files, renameFile, moveFile]);

  return {
    requestMove,
    pending,
    cancel: () => setPending(null),
    replace,
    keepBoth,
  };
}
