import type { FileEntry } from "@houston-ai/agent";
import { useCallback } from "react";
import { detectRenameConflict } from "../lib/file-conflicts";
import { showNameTakenToast } from "../lib/name-taken-toast";
import { useFileWrites } from "./queries";

export function useRenameWithConflict(
  agentPath: string | undefined,
  files: readonly FileEntry[] | undefined,
): (sourcePath: string, newName: string) => void {
  const writes = useFileWrites(agentPath);
  return useCallback(
    (sourcePath: string, newName: string) => {
      const conflict = detectRenameConflict(files ?? [], sourcePath, newName);
      if (conflict.kind === "noop") return;
      if (conflict.kind === "conflict") {
        showNameTakenToast(conflict.name);
        return;
      }
      void writes.rename(sourcePath, newName);
    },
    [files, writes],
  );
}
