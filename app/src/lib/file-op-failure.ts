import { describeError } from "./describe-error";

export type FileOpFailureKind =
  | "locked"
  | "permission"
  | "disk_full"
  | "not_found"
  | "other";

export interface FileOpFailure {
  kind: FileOpFailureKind;
  message: string;
}

const KINDS: ReadonlySet<string> = new Set([
  "locked",
  "permission",
  "disk_full",
  "not_found",
  "other",
]);

export function toFileOpFailure(err: unknown): FileOpFailure {
  if (err !== null && typeof err === "object" && "kind" in err) {
    const raw = err as Record<string, unknown>;
    if (typeof raw.kind === "string" && KINDS.has(raw.kind)) {
      return {
        kind: raw.kind as FileOpFailureKind,
        message: typeof raw.message === "string" ? raw.message : "",
      };
    }
  }
  return { kind: "other", message: describeError(err) };
}

export type FileOp = "save" | "reveal";

export type FileOpStateCopy =
  | "saveLocked"
  | "savePermission"
  | "saveDiskFull"
  | "saveNotFound"
  | "revealPermission";

export type FileOpFailurePlan =
  | { surface: "expected"; copy: FileOpStateCopy; failure: FileOpFailure }
  | { surface: "report"; failure: FileOpFailure };

export function planFileOpFailure(op: FileOp, err: unknown): FileOpFailurePlan {
  const failure = toFileOpFailure(err);
  const copy = expectedCopy(op, failure.kind);
  return copy === null
    ? { surface: "report", failure }
    : { surface: "expected", copy, failure };
}

function expectedCopy(
  op: FileOp,
  kind: FileOpFailureKind,
): FileOpStateCopy | null {
  if (op === "save") {
    if (kind === "locked") return "saveLocked";
    if (kind === "permission") return "savePermission";
    if (kind === "disk_full") return "saveDiskFull";
    if (kind === "not_found") return "saveNotFound";
    return null;
  }
  return kind === "permission" ? "revealPermission" : null;
}
