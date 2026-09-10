// The typed failure the shell's resumable release download rejects with
// (app/src-tauri/src/commands/update_failure.rs), and the two classifiers the
// updater's reporting paths need. Dependency-free so it is node-testable
// directly (app/tests/update-download-failure.test.ts).

export type UpdateDownloadFailureKind =
  | "network"
  | "http"
  | "signature"
  | "other";

/** What the shell reports when a release download gives up: the class, the
 *  last attempt's message, and where the stream stopped. */
export interface UpdateDownloadFailure {
  kind: UpdateDownloadFailureKind;
  message: string;
  received: number;
  total: number | null;
  attempts: number;
}

/** The failure as an `Error`, so the reporting paths carry the byte position
 *  in the message and the class on the instance. */
export class UpdateDownloadError extends Error {
  readonly kind: UpdateDownloadFailureKind;
  readonly received: number;
  readonly total: number | null;
  readonly attempts: number;

  constructor(failure: UpdateDownloadFailure) {
    super(describeDownloadFailure(failure));
    this.name = "UpdateDownloadError";
    this.kind = failure.kind;
    this.received = failure.received;
    this.total = failure.total;
    this.attempts = failure.attempts;
  }
}

const KINDS: ReadonlySet<string> = new Set([
  "network",
  "http",
  "signature",
  "other",
]);

/**
 * Read the shell's rejection into an `UpdateDownloadError`. Anything else
 * (a plain string from an older command, a thrown `Error`) is wrapped as
 * `other` so the caller never has to branch on the raw shape.
 */
export function toUpdateDownloadError(err: unknown): UpdateDownloadError {
  if (err instanceof UpdateDownloadError) return err;
  if (err !== null && typeof err === "object" && "kind" in err) {
    const raw = err as Record<string, unknown>;
    const kind = typeof raw.kind === "string" && KINDS.has(raw.kind);
    if (kind && typeof raw.message === "string") {
      return new UpdateDownloadError({
        kind: raw.kind as UpdateDownloadFailureKind,
        message: raw.message,
        received: typeof raw.received === "number" ? raw.received : 0,
        total: typeof raw.total === "number" ? raw.total : null,
        attempts: typeof raw.attempts === "number" ? raw.attempts : 0,
      });
    }
  }
  return new UpdateDownloadError({
    kind: "other",
    message: err instanceof Error ? err.message : String(err),
    received: 0,
    total: null,
    attempts: 0,
  });
}

/** "stopped at 123456789/315000000 bytes after 4 attempts: error decoding
 *  response body": the Sentry title says where a download died. */
export function describeDownloadFailure(
  failure: UpdateDownloadFailure,
): string {
  const total = failure.total === null ? "?" : String(failure.total);
  const attempts =
    failure.attempts > 0 ? ` after ${failure.attempts} attempts` : "";
  return `stopped at ${failure.received}/${total} bytes${attempts}: ${failure.message}`;
}

/**
 * The messages `reqwest` (the updater plugin's HTTP client) surfaces for a
 * transport-level failure of the release-feed check: the request never got a
 * response, or the body was cut mid-stream. These are the device offline or
 * a proxy/DNS between it and GitHub, the same class as `isNetworkTransportError`
 * on the browser side; they report as the quiet `offline` class, never as a
 * bug per event. A 404 or a malformed manifest ("Could not fetch a valid
 * release JSON") is NOT matched: that shape is how a leaked staging build
 * surfaces itself.
 */
const NETWORK_SHAPED =
  /error sending request|error decoding response body|dns error|connection (reset|refused|closed|aborted)|operation timed out|timed out|network is unreachable|no route to host|tls handshake|certificate|broken pipe|unexpected eof|incomplete message/i;

export function isUpdateNetworkFailure(message: string): boolean {
  return NETWORK_SHAPED.test(message);
}
