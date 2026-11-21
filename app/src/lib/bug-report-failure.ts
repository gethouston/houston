export type BugReportFailureKind = "intake_unavailable" | "other";

export interface BugReportFailure {
  kind: BugReportFailureKind;
  message: string;
}

const KINDS: ReadonlySet<string> = new Set(["intake_unavailable", "other"]);

export function toBugReportFailure(err: unknown): BugReportFailure {
  if (err !== null && typeof err === "object" && "kind" in err) {
    const raw = err as Record<string, unknown>;
    if (typeof raw.kind === "string" && KINDS.has(raw.kind)) {
      return {
        kind: raw.kind as BugReportFailureKind,
        message: typeof raw.message === "string" ? raw.message : "",
      };
    }
  }
  return {
    kind: "other",
    message: err instanceof Error ? err.message : String(err),
  };
}

export class BugReportError extends Error {
  readonly kind: BugReportFailureKind;

  constructor(failure: BugReportFailure) {
    super(failure.message);
    this.name = "BugReportError";
    this.kind = failure.kind;
  }
}

export function isBugIntakeUnavailable(err: unknown): boolean {
  return toBugReportFailure(err).kind === "intake_unavailable";
}
