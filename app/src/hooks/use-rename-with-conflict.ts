/**
 * Rename-with-conflict flow for the Files section: a rename onto a name a
 * sibling already carries is answered from the listing the UI already has,
 * with authored copy, instead of being sent to the host only to come back as a
 * 409. The mutation keeps its own 409 handler for the race (another writer
 * takes the name between the listing and the request) — this is the cheap,
 * instant answer for the case the listing can already see.
 */
import type { FileEntry } from "@houston-ai/agent";
import { useCallback } from "react";
import { detectRenameConflict } from "../lib/file-conflicts";
import { showNameTakenToast } from "../lib/name-taken-toast";
import { useRenameFile } from "./queries";

export function useRenameWithConflict(
  agentPath: string | undefined,
  files: readonly FileEntry[] | undefined,
): (sourcePath: string, newName: string) => void {
  const renameFile = useRenameFile(agentPath);
  return useCallback(
    (sourcePath: string, newName: string) => {
      const conflict = detectRenameConflict(files ?? [], sourcePath, newName);
      if (conflict.kind === "noop") return;
      if (conflict.kind === "conflict") {
        showNameTakenToast(conflict.name);
        return;
      }
      renameFile.mutate({ relativePath: sourcePath, newName });
    },
    [files, renameFile],
  );
}
