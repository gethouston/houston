import {
  type FileOpCode,
  NAME_TAKEN,
  READ_ONLY,
} from "@houston/protocol/file-refusal";
import type { FileEntry } from "@houston-ai/agent";
import { engineErrorCode } from "./engine-error-code.ts";

export function moveTargetPath(
  sourcePath: string,
  toDir: string | null,
): string {
  const name = sourcePath.split("/").pop() ?? "";
  return toDir ? `${toDir}/${name}` : name;
}

function hasEntry(files: readonly FileEntry[], path: string): boolean {
  return files.some((f) => f.path === path || f.path.startsWith(`${path}/`));
}

export type MoveConflict =
  | { kind: "noop" }
  | { kind: "conflict"; targetPath: string; name: string }
  | { kind: "clear" };

export function detectMoveConflict(
  files: readonly FileEntry[],
  sourcePath: string,
  toDir: string | null,
): MoveConflict {
  if (toDir === sourcePath || toDir?.startsWith(`${sourcePath}/`)) {
    return { kind: "noop" };
  }
  const targetPath = moveTargetPath(sourcePath, toDir);
  if (targetPath === sourcePath) return { kind: "noop" };
  if (hasEntry(files, targetPath)) {
    return {
      kind: "conflict",
      targetPath,
      name: targetPath.split("/").pop() ?? "",
    };
  }
  return { kind: "clear" };
}

export type RenameConflict =
  | { kind: "noop" }
  | { kind: "conflict"; targetPath: string; name: string }
  | { kind: "clear" };

export function detectRenameConflict(
  files: readonly FileEntry[],
  sourcePath: string,
  newName: string,
): RenameConflict {
  const slash = sourcePath.lastIndexOf("/");
  const targetPath =
    slash === -1 ? newName : `${sourcePath.slice(0, slash + 1)}${newName}`;
  if (targetPath === sourcePath) return { kind: "noop" };
  if (hasEntry(files, targetPath)) {
    return { kind: "conflict", targetPath, name: newName };
  }
  return { kind: "clear" };
}

export function fileRefusal(err: unknown): FileOpCode | null {
  switch (engineErrorCode(err)) {
    case NAME_TAKEN:
      return NAME_TAKEN;
    case READ_ONLY:
      return READ_ONLY;
    default:
      return null;
  }
}

export function isNameTakenError(err: unknown): boolean {
  return fileRefusal(err) === NAME_TAKEN;
}

export function isReadOnlyError(err: unknown): boolean {
  return fileRefusal(err) === READ_ONLY;
}

export function keepBothName(
  files: readonly FileEntry[],
  sourcePath: string,
  toDir: string | null,
): string {
  const name = sourcePath.split("/").pop() ?? "";
  const slash = sourcePath.lastIndexOf("/");
  const sourceDir = slash === -1 ? null : sourcePath.slice(0, slash);
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  const inDir = (dir: string | null, candidate: string) =>
    hasEntry(files, dir ? `${dir}/${candidate}` : candidate);
  for (let n = 1; ; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!inDir(sourceDir, candidate) && !inDir(toDir, candidate)) {
      return candidate;
    }
  }
}
