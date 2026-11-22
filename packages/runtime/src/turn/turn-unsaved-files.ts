import {
  MAX_UNSAVED_FILES,
  MAX_UNSAVED_PATH,
  type UnsavedFile,
  type UnsavedFileReason,
  type UnsavedFilesReport,
} from "@houston/protocol";

export interface UnsavedSyncInput {
  conflicts: readonly { key: string }[];
  skipped: readonly { key: string; refused?: true }[];
  conflictCopies?: readonly { key: string; copy: string }[];
  deletesKept?: readonly { key: string; refused?: true }[];
  outOfScopeKeys?: readonly string[];
}

function bounded(path: string): string {
  return path.length <= MAX_UNSAVED_PATH
    ? path
    : `…${path.slice(path.length - MAX_UNSAVED_PATH + 1)}`;
}

export function turnUnsavedFiles(
  synced: UnsavedSyncInput,
  workspaceRel: string,
): UnsavedFilesReport | undefined {
  const root = `${workspaceRel}/`;
  const relative = (key: string) =>
    key.startsWith(root) ? { path: key.slice(root.length) } : undefined;
  const entry = (
    key: string,
    reason: UnsavedFileReason,
    copy?: string,
  ): UnsavedFile => {
    const inside = relative(key);
    const copyPath = copy === undefined ? undefined : relative(copy)?.path;
    return {
      path: bounded(inside?.path ?? key),
      reason,
      ...(copyPath ? { copyPath: bounded(copyPath) } : {}),
      ...(inside ? {} : { internal: true as const }),
    };
  };
  const all: UnsavedFile[] = [
    ...(synced.conflictCopies ?? []).map(({ key, copy }) =>
      entry(key, "conflict_copy", copy),
    ),
    ...synced.conflicts.map(({ key }) => entry(key, "conflict")),
    ...(synced.deletesKept ?? []).map(({ key, refused }) =>
      entry(key, refused ? "out_of_scope" : "delete_kept"),
    ),
    ...synced.skipped.map(({ key, refused }) =>
      entry(key, refused ? "out_of_scope" : "too_large"),
    ),
    ...(synced.outOfScopeKeys ?? []).map((key) => entry(key, "out_of_scope")),
  ];
  const counts: UnsavedFilesReport["counts"] = {};
  for (const { reason } of all) counts[reason] = (counts[reason] ?? 0) + 1;
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  if (total === 0) return undefined;
  const files = [
    ...all.filter((file) => !file.internal),
    ...all.filter((file) => file.internal),
  ].slice(0, MAX_UNSAVED_FILES);
  return { files, total, counts };
}
