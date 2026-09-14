// The typed failure the shell's `open_url` command rejects with
// (app/src-tauri/src/commands/open_url_failure.rs), read into an Error the
// rest of the error layer can classify. Dependency-free so it is
// node-testable directly (app/tests/open-url-failure.test.ts).
//
// PRODUCT-1814: a Windows machine with no default browser answers every
// open with `ShellExecuteW failed (code 31)` (SE_ERR_NOASSOC). One ChatGPT
// sign-in filed that as three Sentry bugs (HOUSTON-APP-5EV / 5ES / 5ET) and
// told the user nothing useful. It is a state of their machine with a remedy
// (set a default browser, or copy the link), so `no_handler` is a quiet
// class: one informational toast, one fingerprinted warning, never a bug.

export type OpenUrlFailureKind = "no_handler" | "other";

const KINDS: ReadonlySet<string> = new Set(["no_handler", "other"]);

export class OpenUrlError extends Error {
  readonly kind: OpenUrlFailureKind;

  constructor(kind: OpenUrlFailureKind, message: string) {
    super(message);
    this.name = "OpenUrlError";
    this.kind = kind;
  }
}

/**
 * Wrap a rejection off `invoke("open_url")` as an `OpenUrlError`. The shell
 * rejects with the typed `{ kind, message }`; a plain string (an older
 * shell) or a thrown `Error` is `other`, so no caller branches on the raw
 * shape. Already-wrapped errors pass through.
 */
export function toOpenUrlError(err: unknown): OpenUrlError {
  if (err instanceof OpenUrlError) return err;
  if (err !== null && typeof err === "object" && "kind" in err) {
    const raw = err as Record<string, unknown>;
    if (typeof raw.kind === "string" && KINDS.has(raw.kind)) {
      return new OpenUrlError(
        raw.kind as OpenUrlFailureKind,
        typeof raw.message === "string" ? raw.message : "",
      );
    }
  }
  return new OpenUrlError(
    "other",
    err instanceof Error ? err.message : String(err),
  );
}

/** The machine has nothing registered to open a URL: no default browser. */
export function isNoUrlHandlerError(err: unknown): boolean {
  return err instanceof OpenUrlError && err.kind === "no_handler";
}
