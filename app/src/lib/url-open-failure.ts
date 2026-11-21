import { describeError } from "./describe-error";

export type UrlOpenFailureKind = "no_handler" | "other";

export interface UrlOpenFailure {
  kind: UrlOpenFailureKind;
  message: string;
}

const KINDS: ReadonlySet<string> = new Set(["no_handler", "other"]);

export function toUrlOpenFailure(err: unknown): UrlOpenFailure {
  if (err !== null && typeof err === "object" && "kind" in err) {
    const raw = err as Record<string, unknown>;
    if (typeof raw.kind === "string" && KINDS.has(raw.kind)) {
      return {
        kind: raw.kind as UrlOpenFailureKind,
        message: typeof raw.message === "string" ? raw.message : "",
      };
    }
  }
  return { kind: "other", message: describeError(err) };
}

export class UrlOpenError extends Error {
  readonly kind: UrlOpenFailureKind;

  constructor(failure: UrlOpenFailure) {
    super(failure.message);
    this.name = "UrlOpenError";
    this.kind = failure.kind;
  }
}

export function isNoBrowserFailure(err: unknown): boolean {
  return toUrlOpenFailure(err).kind === "no_handler";
}

export type UrlOpenFailurePlan =
  | { surface: "expected"; copy: "noBrowser"; failure: UrlOpenFailure }
  | { surface: "report"; failure: UrlOpenFailure };

export function planUrlOpenFailure(err: unknown): UrlOpenFailurePlan {
  const failure = toUrlOpenFailure(err);
  return failure.kind === "no_handler"
    ? { surface: "expected", copy: "noBrowser", failure }
    : { surface: "report", failure };
}
