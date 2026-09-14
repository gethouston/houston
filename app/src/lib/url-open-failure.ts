// The typed failure the shell's `open_url` command rejects with
// (app/src-tauri/src/commands/url_open_failure.rs) and the one decision every
// caller makes with it: is this a state the user can act on, or a bug to
// report? Dependency-free so it is node-testable directly
// (app/tests/url-open-failure.test.ts).

export type UrlOpenFailureKind = "no_handler" | "other";

export interface UrlOpenFailure {
  kind: UrlOpenFailureKind;
  /** The raw OS diagnostic. Log it, never show it. */
  message: string;
}

const KINDS: ReadonlySet<string> = new Set(["no_handler", "other"]);

/**
 * Read a shell rejection into a `UrlOpenFailure`. A plain string (an older
 * shell) or a thrown `Error` is `other`, so the caller never branches on the
 * raw shape.
 */
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
  return {
    kind: "other",
    message: err instanceof Error ? err.message : String(err),
  };
}

/**
 * The shell's rejection as an Error, so the layers that only understand
 * Errors (the codex loopback's `logAndReportError`, the frontend log line,
 * a `cause` chain) see the diagnostic instead of `[object Object]`, while
 * `toUrlOpenFailure` still reads `kind` off it. `osOpenUrl` mints it.
 */
export class UrlOpenError extends Error {
  readonly kind: UrlOpenFailureKind;

  constructor(failure: UrlOpenFailure) {
    super(failure.message);
    this.name = "UrlOpenError";
    this.kind = failure.kind;
  }
}

/** A machine with no default browser, off any shape of the rejection. */
export function isNoBrowserFailure(err: unknown): boolean {
  return toUrlOpenFailure(err).kind === "no_handler";
}

export type UrlOpenFailurePlan =
  | { surface: "expected"; copy: "noBrowser"; failure: UrlOpenFailure }
  | { surface: "report"; failure: UrlOpenFailure };

/**
 * Where a failed browser open goes: an informational toast for a machine with
 * no default browser (Windows `SE_ERR_NOASSOC`, HOUSTON-APP-5ES: filed as a
 * bug in the OS language, though only the user can fix it, in the OS
 * settings), or the report path for everything else.
 */
export function planUrlOpenFailure(err: unknown): UrlOpenFailurePlan {
  const failure = toUrlOpenFailure(err);
  return failure.kind === "no_handler"
    ? { surface: "expected", copy: "noBrowser", failure }
    : { surface: "report", failure };
}
