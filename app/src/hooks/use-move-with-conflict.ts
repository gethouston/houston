import type { FileEntry } from "@houston-ai/agent";
import { useCallback, useState } from "react";
import { detectMoveConflict, keepBothName } from "../lib/file-conflicts";
import { useFileWrites } from "./queries";

export interface PendingMove {
  sourcePath: string;
  toDir: string | null;
  name: string;
  targetPath: string;
}

export function useMoveWithConflict(
  agentPath: string | undefined,
  files: readonly FileEntry[] | undefined,
) {
  const writes = useFileWrites(agentPath);
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
      void writes.move(sourcePath, toDir);
    },
    [files, writes],
  );

  const replace = useCallback(() => {
    if (!pending) return;
    setPending(null);
    void writes.replace(pending.targetPath, pending.sourcePath, pending.toDir);
  }, [pending, writes]);

  const keepBoth = useCallback(() => {
    if (!pending) return;
    setPending(null);
    const newName = keepBothName(
      files ?? [],
      pending.sourcePath,
      pending.toDir,
    );
    void writes.keepBoth(pending.sourcePath, newName, pending.toDir);
  }, [pending, files, writes]);

  return {
    requestMove,
    pending,
    cancel: () => setPending(null),
    replace,
    keepBoth,
  };
}
