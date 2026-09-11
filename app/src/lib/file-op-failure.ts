// The typed failure the shell's file commands reject with
// (app/src-tauri/src/commands/file_failure.rs) and the one decision every
// caller makes with it: is this a state the user can act on, or a bug to
// report? Dependency-free so it is node-testable directly
// (app/tests/file-op-failure.test.ts).

export type FileOpFailureKind = "locked" | "permission" | "disk_full" | "other";

export interface FileOpFailure {
  kind: FileOpFailureKind;
  /** The raw OS diagnostic, in the OS language. Log it, never show it. */
  message: string;
}

const KINDS: ReadonlySet<string> = new Set([
  "locked",
  "permission",
  "disk_full",
  "other",
]);

/**
 * Read a shell rejection into a `FileOpFailure`. A plain string (an older
 * command, a dialog that could not open) or a thrown `Error` is `other`, so
 * the caller never branches on the raw shape.
 */
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
  return {
    kind: "other",
    message: err instanceof Error ? err.message : String(err),
  };
}

export type FileOp = "save" | "reveal";

/** The authored expected-state copy a failure maps to, keyed the same way in
 *  every locale namespace that carries file toasts. */
export type FileOpStateCopy =
  | "saveLocked"
  | "savePermission"
  | "saveDiskFull"
  | "revealPermission";

export type FileOpFailurePlan =
  | { surface: "expected"; copy: FileOpStateCopy; failure: FileOpFailure }
  | { surface: "report"; failure: FileOpFailure };

/**
 * Where a failed save / reveal goes: an informational toast with authored
 * copy for the OS states a user can fix (the destination is open in another
 * program, the folder is protected, the disk is full: HOUSTON-APP-53A and
 * -5C6 were these, filed as bugs in the OS language), or the report path
 * for everything else. A reveal has one expected state: Explorer refusing
 * to launch. A locked or full-disk reveal is not a thing, so it reports.
 */
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
    return null;
  }
  return kind === "permission" ? "revealPermission" : null;
}
